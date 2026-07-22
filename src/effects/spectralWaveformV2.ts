/**
 * AUDIO WAVEFORM V2 — one continuous full-bleed 3D dotted audio surface that is a
 * true ~2-second time history of the music.
 *
 * A single THREE.Points field (one draw call, one ShaderMaterial) forms a
 * luminous dotted landscape that overscans the viewport: the FRONT rows are wider
 * than the screen and drop BELOW its bottom edge (no rectangular footprint), the
 * rows rise into depth toward a horizon near mid-screen where a per-point fade
 * takes them to zero opacity (no visible last row), and the sides stay overscanned
 * until they fade. The scene camera is orthographic, so screen-Y is affine in
 * world-Y; rows are therefore placed with a LINEAR (even) on-screen pitch across
 * the row index — the exact inverse projection — so they read as one continuously
 * dense dotted surface with no widening gaps toward the bottom. Depth cues come
 * from linear row-narrowing, point-size shrink and the far fade, not from vertical
 * bunching. Row placement (geometry) is kept independent of the audio history.
 *
 * Temporal history (the core behaviour): a preallocated ring buffer captures the
 * smoothed spectral profile at a fixed rate (historyHz), independent of frame
 * rate. Ageing uses REAL elapsed time, so the visible surface is ~2.0 real seconds
 * at 30/60/120 FPS. Each visible depth row samples the buffer by AGE (front row =
 * live profile, back row ≈ historySeconds old); the sampler includes the fractional
 * time since the newest capture and interpolates between adjacent frozen snapshots,
 * so a crest enters at the front, travels backward continuously as time passes,
 * geometrically compresses and fades, and leaves the surface after ~2s. A stored
 * snapshot is frozen at capture — old rows keep their captured shape and are never
 * rewritten with the current spectrum. When playback stops, recent formations keep
 * travelling out while the near rows settle to the idle terrain.
 *
 * Deformation: local spectral-band energy maps across X (bass → highs) with a
 * gain + contrast curve and a small neighbour-column blur so peaks become
 * connected hills (not FFT needles). A deterministic multi-octave terrain gives
 * several coexisting peaks/valleys even in silence (also the reduced-motion
 * surface); active music dominates. Every dot is the single hue #60A3BF (config
 * `color`) — no spectral / rainbow palette; only brightness and alpha vary.
 * Driven by the SHARED audio pipeline (getHeatmap()/getEnv()) — no new
 * AudioContext/analyser/listener.
 *
 * THREE is passed in (not imported) so this module never statically bundles
 * three — Monogram loads it via dynamic import and hands the instance here.
 * Lifecycle: create / update / resize / dispose, no per-frame allocation. The
 * desktop/mobile grid is rebuilt in-place on a 767px breakpoint crossing (Monogram
 * does not recreate the instance), keeping the single Points draw call.
 */
import type * as THREE from "three";
import { getEnv, getHeatmap } from "@/effects/audioReactive";
import { AUDIO_WAVEFORM } from "@/effects/effectsConfig";

export type SpectralWaveformV2 = {
  object3D: THREE.Object3D;
  update: (f: { dtSec: number; time: number; reducedMotion: boolean }) => void;
  resize: (vw: number, vh: number) => void;
  dispose: () => void;
};

const VERT = /* glsl */ `
  attribute float aU; // 0..1 column (spectral band position across X)
  attribute float aV; // 0..1 row (0 = front / newest, 1 = back / oldest ~2s)
  uniform sampler2D uField;                  // NX x NZ amplitude history (.r, 0..1)
  uniform float uWidth, uFrontY, uHorizonY;  // full-bleed screen layout (px)
  uniform float uDepthFront, uDepthBack;     // z of front/back rows (ortho depth)
  uniform float uRowShrink;                  // linear back-row narrowing
  uniform float uAmp, uIdleAmp;              // audio + idle-terrain relief (px)
  uniform float uBackHeightScale, uHeightFalloffStart; // travelling-crest height
  uniform float uFrontExtend;                // plane param start (< 0 = foreground)
  uniform float uPointSize, uPointDepthShrink, uDpr;
  varying float vAmp;
  varying float vV;

  // Deterministic multi-octave terrain: several peaks/valleys in BOTH X and depth
  // (never one ridge or one repeated sine). Time-independent → static when silent.
  float terrain(vec2 p) {
    float h = 0.0;
    h += sin(p.x * 3.1 + 0.7) * cos(p.y * 2.3 + 1.1) * 0.60;
    h += sin(p.x * 6.7 + 2.0) * cos(p.y * 4.1 + 0.3) * 0.30;
    h += sin(p.x * 11.3 + p.y * 5.0 + 1.7) * 0.16;
    return h;
  }

  void main() {
    // ONE flat inclined plane. The row index (aV, 0..1) is remapped to a plane
    // parameter that starts BELOW the front (geoAV < 0), so real rows continue the
    // SAME flat plane past the bottom edge (off-screen) — coverage by extension,
    // not by bending. Orthographic camera → screen-Y is affine in world-Y, so a
    // linear geoAV gives an even on-screen row pitch (no widening bands).
    float geoAV = mix(uFrontExtend, 1.0, aV);
    float xScale = 1.0 - geoAV * uRowShrink;           // linear narrowing into depth
    float x = (aU - 0.5) * uWidth * xScale;
    float z = mix(uDepthFront, uDepthBack, geoAV);      // recede behind glass
    float amp = texture2D(uField, vec2(aU, aV)).r;      // audio (row index = age)
    // Travelling crest keeps most of its height near/middle, then compresses back.
    float hScale = mix(1.0, uBackHeightScale, smoothstep(uHeightFalloffStart, 1.0, geoAV));
    float idle = terrain(vec2(aU, geoAV)) * uIdleAmp;   // deterministic low relief
    float planeY = mix(uFrontY, uHorizonY, geoAV);      // rigid flat-plane base
    // finalPosition = rigid flat-plane base + UNCHANGED audio/idle displacement.
    // No screen-Y-dependent mask: waves keep full strength across the whole plane.
    float y = planeY + amp * uAmp * hScale + idle;
    vAmp = amp;
    vV = geoAV;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(x, y, z, 1.0);
    gl_PointSize = max(1.0, uPointSize * uDpr * (1.0 - geoAV * uPointDepthShrink));
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  varying float vAmp;
  varying float vV;
  uniform vec3 uColor;         // single hue #60A3BF (no palette)
  uniform float uBrightness, uFadeStart;
  void main() {
    vec2 pc = gl_PointCoord - 0.5;
    float d = length(pc);
    if (d > 0.5) discard;                              // round, AA'd dots
    float soft = 1.0 - smoothstep(0.12, 0.5, d);
    // Far/back fade: 1 up to uFadeStart, easing to 0 at the very back row.
    float depthFade = 1.0 - smoothstep(uFadeStart, 1.0, vV);
    float bright = uBrightness * (0.32 + vAmp * 1.0);
    float alpha = soft * (0.42 + vAmp * 0.58) * depthFade;
    gl_FragColor = vec4(uColor * bright, alpha);
  }
`;

// Size-dependent state (rebuilt when the desktop/mobile column count changes).
type Alloc = {
  mobile: boolean;
  NX: number;
  NZ: number;
  geometry: THREE.BufferGeometry;
  fieldData: Uint8Array;
  fieldTex: THREE.DataTexture;
  colBandPos: Float32Array; // per-column log-frequency position (0..1) into bands
  region: Float32Array; // per-column motion region (0 = bass .. 1 = high)
  attackRate: Float32Array; // per-column attack rate (1/s), by region
  releaseRate: Float32Array; // per-column release rate (1/s), by region
  bandGain: Float32Array; // per-column post-gamma displacement gain (height rebalance)
  decayLUT: Float32Array; // per-cell (row×col) energy-decay by pulse age + band
  smooth: Float32Array; // spectrum resampled to columns
  wide: Float32Array; // wide-blur reference (bass influence / unsharp base)
  smoothB: Float32Array; // articulated (region-processed) columns
  colState: Float32Array; // live front profile (attack/release)
  SNAP_N: number; // ring length
  snaps: Float32Array; // frozen spectral snapshots (ring buffer)
  snapHead: number; // index of the newest stored snapshot
  snapAcc: number; // capture-time accumulator (seconds since newest capture)
  rmCleared: boolean; // reduced-motion field already cleared
};

export function createSpectralWaveformV2(
  three: typeof import("three"),
  opts: { vw: number; vh: number; isMobile: boolean; dpr: number },
): SpectralWaveformV2 {
  const cfg = AUDIO_WAVEFORM;

  // Fixed-rate temporal history constants (breakpoint-independent).
  const SNAP_HZ = cfg.historyHz; // captures per second
  const SNAP_DT = 1 / SNAP_HZ; // seconds between captures
  const MAX_AGE_SNAPS = cfg.historySeconds * SNAP_HZ; // oldest visible age (snaps)
  const SNAP_N = Math.round(MAX_AGE_SNAPS) + 2; // ring length (+headroom)

  // Full-bleed layout resolved per viewport. Kept as a function so resize picks
  // the correct desktop/mobile overscan/horizon (breakpoint matches the shared
  // audio pipeline's mobile check at <= 767px).
  const layout = (vw: number, vh: number) => {
    const m = vw <= 767;
    const widthFrac = m ? cfg.widthFracMobile : cfg.widthFracDesktop;
    const overhang = m ? cfg.frontOverhangFracMobile : cfg.frontOverhangFracDesktop;
    const horizon = m ? cfg.horizonFracMobile : cfg.horizonFracDesktop;
    return {
      width: vw * widthFrac,
      frontY: -vh / 2 - overhang * vh, // geoAV=0 sits below the viewport bottom
      horizonY: -vh / 2 + horizon * vh, // horizon near mid-screen (geoAV=1)
    };
  };

  // Allocate every size-dependent buffer for a breakpoint. Pure — assigns nothing
  // to the shared Points/material (the caller wires geometry + uField texture).
  const allocate = (mobile: boolean): Alloc => {
    const NX = mobile ? cfg.columnsMobile : cfg.columnsDesktop;
    const NZ = mobile ? cfg.rowsMobile : cfg.rowsDesktop;
    const COUNT = NX * NZ;
    // Normalized column/row attributes; the real position is computed in the
    // vertex shader from uniforms (so a viewport resize is a uniform update).
    const positions = new Float32Array(COUNT * 3);
    const colU = new Float32Array(COUNT);
    const rowV = new Float32Array(COUNT);
    let k = 0;
    for (let r = 0; r < NZ; r++) {
      for (let c = 0; c < NX; c++) {
        colU[k] = NX > 1 ? c / (NX - 1) : 0;
        rowV[k] = NZ > 1 ? r / (NZ - 1) : 0;
        k++;
      }
    }
    const geometry = new three.BufferGeometry();
    geometry.setAttribute("position", new three.BufferAttribute(positions, 3));
    geometry.setAttribute("aU", new three.BufferAttribute(colU, 1));
    geometry.setAttribute("aV", new three.BufferAttribute(rowV, 1));

    // Depth field texture: NX x NZ, single R channel. Rebuilt each frame from the
    // ring buffer by sampling history per row by age.
    const fieldData = new Uint8Array(NX * NZ);
    const fieldTex = new three.DataTexture(
      fieldData,
      NX,
      NZ,
      three.RedFormat,
      three.UnsignedByteType,
    );
    fieldTex.minFilter = three.LinearFilter;
    fieldTex.magFilter = three.LinearFilter;
    fieldTex.wrapS = three.ClampToEdgeWrapping;
    fieldTex.wrapT = three.ClampToEdgeWrapping;
    fieldTex.needsUpdate = true;

    // Frequency-aware horizontal map: split the width into low/mid/high segments
    // (lowWidthFrac / midWidthFrac / highWidthFrac) and log-interpolate frequency
    // across each segment's Hz range, then convert that target frequency to a
    // fractional position (0..1) into the log-spaced analyser bands. Compact bass
    // (left 20%), rich mids (centre 50%), airy highs (right 30%) — not a naive
    // equal-band split. Frequency is continuous across the segment boundaries, so
    // there are no seams (the spatial articulation smooths the slope change).
    // Precomputed once per breakpoint; the per-frame resample just reads it.
    const colBandPos = new Float32Array(NX);
    const lowW = cfg.lowWidthFrac;
    const midW = cfg.midWidthFrac;
    const highW = cfg.highWidthFrac;
    const fLo = cfg.bandFreqLowHz;
    const fLoMax = cfg.lowMaxHz;
    const fMidMax = cfg.midMaxHz;
    const fHi = cfg.bandFreqHighHz;
    const denom = Math.log(fHi / fLo);
    for (let c = 0; c < NX; c++) {
      const x = NX > 1 ? c / (NX - 1) : 0;
      let freq: number;
      if (x < lowW) {
        freq = fLo * Math.pow(fLoMax / fLo, x / lowW);
      } else if (x < lowW + midW) {
        freq = fLoMax * Math.pow(fMidMax / fLoMax, (x - lowW) / midW);
      } else {
        freq = fMidMax * Math.pow(fHi / fMidMax, (x - lowW - midW) / highW);
      }
      const p = Math.log(freq / fLo) / denom;
      colBandPos[c] = p < 0 ? 0 : p > 1 ? 1 : p;
    }

    // Per-column motion region (0 = bass .. 1 = high), aligned to the 20/50/30
    // boundaries, plus the region-interpolated temporal rates. `ss` is smoothstep;
    // `r3` is a 3-point interpolation so bass/mid/high each keep a distinct rate.
    const region = new Float32Array(NX);
    const attackRate = new Float32Array(NX);
    const releaseRate = new Float32Array(NX);
    const bandGain = new Float32Array(NX);
    const ss = (e0: number, e1: number, v: number) => {
      const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
      return t * t * (3 - 2 * t);
    };
    const r3 = (a: number, b: number, cc: number, t: number) =>
      t < 0.5 ? a + (b - a) * (t * 2) : b + (cc - b) * ((t - 0.5) * 2);
    for (let c = 0; c < NX; c++) {
      const x = NX > 1 ? c / (NX - 1) : 0;
      const rg = ss(lowW, lowW + midW, x); // 0 across bass, ~0.5 mid, 1 across high
      region[c] = rg;
      attackRate[c] = r3(cfg.attackRateBass, cfg.attackRateMid, cfg.attackRateHigh, rg);
      releaseRate[c] = r3(
        cfg.releaseRateBass,
        cfg.releaseRateMid,
        cfg.releaseRateHigh,
        rg,
      );
      bandGain[c] = r3(cfg.bandGainBass, cfg.bandGainMid, cfg.bandGainHigh, rg);
    }

    // Per-cell energy-decay LUT: a pulse fades with AGE (row) at a rate set by its
    // frequency REGION (column) — bass slow, highs fast. Static (audio-independent),
    // so precompute once. Full for the first pulseHoldFrac of the life, then a
    // smoothstep down to 0 by the band's lifetime → clean, pop-free disappearance.
    const decayLUT = new Float32Array(NX * NZ);
    const fe = cfg.frontExtend;
    const hold = cfg.pulseHoldFrac;
    for (let r = 0; r < NZ; r++) {
      const rowV = NZ > 1 ? r / (NZ - 1) : 0;
      const ageSec = Math.max(0, fe + rowV * (1 - fe)) * cfg.historySeconds;
      for (let c = 0; c < NX; c++) {
        const life = r3(
          cfg.pulseLifeBass,
          cfg.pulseLifeMid,
          cfg.pulseLifeHigh,
          region[c],
        );
        const t = life > 0 ? ageSec / life : 1;
        let d: number;
        if (t <= hold) d = 1;
        else if (t >= 1) d = 0;
        else {
          const u = (t - hold) / (1 - hold);
          d = 1 - u * u * (3 - 2 * u); // smoothstep down to 0
        }
        decayLUT[r * NX + c] = d;
      }
    }

    return {
      mobile,
      NX,
      NZ,
      geometry,
      fieldData,
      fieldTex,
      colBandPos,
      region,
      attackRate,
      releaseRate,
      bandGain,
      decayLUT,
      smooth: new Float32Array(NX),
      wide: new Float32Array(NX),
      smoothB: new Float32Array(NX),
      colState: new Float32Array(NX),
      SNAP_N,
      snaps: new Float32Array(SNAP_N * NX),
      snapHead: 0,
      snapAcc: 0,
      rmCleared: false,
    };
  };

  let st = allocate(opts.isMobile);

  const lay = layout(opts.vw, opts.vh);
  const uniforms = {
    uField: { value: st.fieldTex as THREE.Texture },
    uWidth: { value: lay.width },
    uFrontY: { value: lay.frontY },
    uHorizonY: { value: lay.horizonY },
    uFrontExtend: { value: cfg.frontExtend },
    uDepthFront: { value: cfg.depthFront },
    uDepthBack: { value: cfg.depthBack },
    uRowShrink: { value: cfg.rowShrink },
    uAmp: { value: cfg.ampPx },
    uIdleAmp: { value: cfg.idleAmpPx },
    uBackHeightScale: { value: cfg.backHeightScale },
    uHeightFalloffStart: { value: cfg.heightFalloffStart },
    uPointSize: { value: cfg.pointSize },
    uPointDepthShrink: { value: cfg.pointDepthShrink },
    uDpr: { value: Math.min(opts.dpr, 2) },
    uColor: { value: new three.Color(cfg.color[0], cfg.color[1], cfg.color[2]) },
    uBrightness: { value: cfg.brightness },
    uFadeStart: { value: cfg.fadeStart },
  };

  const material = new three.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: three.AdditiveBlending,
  });

  const points = new three.Points(st.geometry, material);
  points.renderOrder = -1; // background layer (behind the monogram)
  points.frustumCulled = false; // positions live in the shader

  const resample = (field: Float32Array) => {
    const NX = st.NX;
    const n = field.length; // e.g. 40 perceptual bands (log-spaced in frequency)
    for (let c = 0; c < NX; c++) {
      // Frequency-aware placement (20/50/30) instead of a linear band→column map.
      const f = st.colBandPos[c] * (n - 1);
      const i0 = Math.floor(f);
      const i1 = Math.min(n - 1, i0 + 1);
      const t = f - i0;
      st.smooth[c] = field[i0] * (1 - t) + field[i1] * t;
    }
  };

  // Region-aware spatial articulation. A wide box blur gives the bass a broad
  // influence radius; mids/highs blend toward an UNSHARP-masked version of the
  // raw column signal (smooth + K·(smooth − wide)) so local detail re-emerges as
  // more, narrower peaks. Bass (region 0) → wide; high (region 1) → sharpened.
  // All from the real spectrum; clamped to [0,1] so no needle spikes.
  const articulate = () => {
    const NX = st.NX;
    const R = cfg.wideBlurRadius;
    const K = cfg.unsharpAmount;
    for (let c = 0; c < NX; c++) {
      let acc = 0;
      let w = 0;
      for (let j = c - R; j <= c + R; j++) {
        if (j < 0 || j >= NX) continue;
        acc += st.smooth[j];
        w++;
      }
      st.wide[c] = w > 0 ? acc / w : 0;
    }
    for (let c = 0; c < NX; c++) {
      const sharp = st.smooth[c] + K * (st.smooth[c] - st.wide[c]); // unsharp mask
      const v = st.wide[c] + (sharp - st.wide[c]) * st.region[c]; // bass→wide, high→sharp
      st.smoothB[c] = v < 0 ? 0 : v > 1 ? 1 : v;
    }
  };

  // Frozen stored snapshot `j` captures before the head, for column c (ring wrap).
  const storedCol = (j: number, c: number) => {
    const idx = (((st.snapHead - j) % st.SNAP_N) + st.SNAP_N) % st.SNAP_N;
    return st.snaps[idx * st.NX + c];
  };

  // Continuous history sample by AGE (seconds). Age 0 = live front profile; the
  // newest stored snapshot sits at age `snapAcc` (fractional capture phase), older
  // snapshots at uniform SNAP_DT spacing. Interpolates so crests travel smoothly
  // between captures and across capture events; ages beyond the window read the
  // (zeroed / oldest) tail.
  const sampleByAge = (ageSec: number, c: number) => {
    if (ageSec <= 0) return st.colState[c];
    const phase = st.snapAcc;
    if (ageSec <= phase) {
      const t = phase > 1e-6 ? ageSec / phase : 1;
      const s0 = st.colState[c];
      const s1 = storedCol(0, c);
      return s0 + (s1 - s0) * t;
    }
    const a = (ageSec - phase) / SNAP_DT;
    const j0 = Math.floor(a);
    const jf = a - j0;
    const s0 = storedCol(j0, c);
    const s1 = storedCol(j0 + 1, c);
    return s0 + (s1 - s0) * jf;
  };

  // Rebuild the depth field. Age is a function of the ROW INDEX via the SAME plane
  // parameter the shader uses (geoAV = mix(frontExtend, 1, rowV)); rows with
  // geoAV >= 0 sample the continuous ~2s history (never duplicated/shortened),
  // while the off-screen foreground rows (geoAV < 0) clamp to age 0 — the live
  // newest spectrum extending the plane forward, not stale snapshots.
  const buildField = () => {
    const { NX, NZ, fieldData } = st;
    const fe = cfg.frontExtend;
    for (let r = 0; r < NZ; r++) {
      const rowV = NZ > 1 ? r / (NZ - 1) : 0;
      const geoAV = fe + rowV * (1 - fe); // plane parameter (may be < 0 = foreground)
      const ageSec = Math.max(0, geoAV) * cfg.historySeconds;
      const row = r * NX;
      for (let c = 0; c < NX; c++) {
        // Frozen historical energy × per-cell pulse-age decay → pulses lose height
        // as they travel back and die into the flat plane (no permanent ocean).
        const v = sampleByAge(ageSec, c) * st.decayLUT[row + c];
        fieldData[row + c] = v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255);
      }
    }
  };

  const update = (f: { dtSec: number; time: number; reducedMotion: boolean }) => {
    if (f.reducedMotion) {
      // Immediately show the deterministic low-relief terrain (not a frozen
      // musical field): clear the depth field + history once, then idle cheaply.
      if (!st.rmCleared) {
        st.fieldData.fill(0);
        st.fieldTex.needsUpdate = true;
        st.snaps.fill(0);
        st.colState.fill(0);
        st.snapHead = 0;
        st.snapAcc = 0;
        st.rmCleared = true;
      }
      return;
    }
    st.rmCleared = false;

    const dtReal = f.dtSec > 0 ? f.dtSec : 1 / 60; // ages the history in real time
    const dtSmooth = Math.min(dtReal, 0.05); // bounded → attack/release stability

    // 1) Build the live FRONT profile from the shared analyser field: gain lifts
    //    the normalised energy, contrast separates peaks, attack/release smooth it
    //    (per-second rates → frame-rate independent). env fades on play/pause.
    const field = getHeatmap(); // shared spectral field (0..1), low→high
    const env = getEnv();
    resample(field);
    articulate();
    const NX = st.NX;
    for (let c = 0; c < NX; c++) {
      const boosted = Math.min(1, st.smoothB[c] * cfg.spectralGain);
      // Per-band height rebalance AFTER the gamma: pull bass down, lift mids/highs
      // so the optical envelope is even across the width (compensates the upstream
      // bass-dominant normalization). >1 is fine here — clamped when written.
      const target = Math.pow(boosted, cfg.contrast) * env * st.bandGain[c];
      const cur = st.colState[c];
      // Region-dependent attack/release: highs snap + decay fast, bass stays heavy
      // → adjacent regions no longer rise/fall together (articulated alternation).
      const rate = target >= cur ? st.attackRate[c] : st.releaseRate[c];
      const k = 1 - Math.exp(-rate * dtSmooth);
      st.colState[c] = cur + (target - cur) * k;
    }

    // 2) Capture snapshots at a fixed rate in REAL time. If a suspended frame
    //    skipped more than the whole visible window, the old musical history is
    //    obsolete → clear it (bounded) rather than an unbounded catch-up loop.
    st.snapAcc += dtReal;
    if (st.snapAcc > cfg.historySeconds) {
      st.snaps.fill(0);
      st.snapHead = 0;
      st.snapAcc = SNAP_DT;
    }
    let pushes = 0;
    while (st.snapAcc >= SNAP_DT && pushes < st.SNAP_N) {
      st.snapHead = (st.snapHead + 1) % st.SNAP_N;
      st.snaps.set(st.colState, st.snapHead * NX); // freeze the current profile
      st.snapAcc -= SNAP_DT;
      pushes++;
    }

    // 3) Sample the frozen history by age into the depth field (front→back).
    buildField();
    st.fieldTex.needsUpdate = true;
  };

  const resize = (vw: number, vh: number) => {
    const l = layout(vw, vh);
    uniforms.uWidth.value = l.width;
    uniforms.uFrontY.value = l.frontY;
    uniforms.uHorizonY.value = l.horizonY;

    // Breakpoint crossing: Monogram does not recreate the instance, so rebuild the
    // grid/attributes/texture/history for the new column count in place and swap
    // them onto the existing Points + material (one draw call preserved).
    const mobile = vw <= 767;
    if (mobile !== st.mobile) {
      const old = st;
      st = allocate(mobile);
      points.geometry = st.geometry;
      uniforms.uField.value = st.fieldTex;
      old.geometry.dispose();
      old.fieldTex.dispose();
    }
  };

  const dispose = () => {
    st.geometry.dispose();
    material.dispose();
    st.fieldTex.dispose();
  };

  return { object3D: points, update, resize, dispose };
}
