/**
 * Sonic Pulse audio engine — ONE AudioContext, ONE MediaElementSource, ONE
 * AnalyserNode for the whole app, attached to the single persistent <audio>
 * element. It exposes smoothed bass/mid/high bands (attack/release + noise gate
 * + a play/pause fade envelope) that the WebGL scene reads, and it writes a
 * `--pulse-bar` CSS custom property for the player bar micro-waveform.
 *
 * Only ONE requestAnimationFrame ever runs: while the Monogram is mounted it
 * "claims the driver" and calls tick() from its own loop; otherwise this module
 * runs a tiny internal rAF (only while audio is playing / fading) purely to keep
 * the player bar alive on routes without the WebGL scene.
 *
 * createMediaElementSource() may be called only once per element, so the graph
 * is a module-level singleton guarded against React Strict Mode double-mounts.
 */
import { EFFECTS, HEATMAP, PULSE, telemetry } from "./effectsConfig";

type Graph = {
  ctx: AudioContext;
  source: MediaElementAudioSourceNode;
  analyser: AnalyserNode;
  freq: Uint8Array<ArrayBuffer>;
  el: HTMLMediaElement;
};

let graph: Graph | null = null;
let playingTarget = false; // desired state (real playback)
let env = 0; // 0..1 fade envelope (in on play, out on pause)
const bands = { bass: 0, mid: 0, high: 0 }; // smoothed (curved/normalized), pre-envelope
const peaks = { bass: PULSE.peakFloor, mid: PULSE.peakFloor, high: PULSE.peakFloor };

// --- Desktop spectral heatmap: all arrays reused, never allocated in the loop --
const HM_N = HEATMAP.numBands;
const hmSmooth = new Float32Array(HM_N); // temporally smoothed per-band energy (0..1)
const hmRaw = new Float32Array(HM_N); // raw band energy scratch (reused each frame)
const hmField = new Float32Array(HM_N); // spatially blurred output (getHeatmap)
let hmNorm = HEATMAP.normFloor; // adaptive normalization peak
let externalDriver = false; // true while the Monogram loop drives tick()
let internalRaf = 0;
let internalLast = 0;
let visibilityHooked = false;

const isMobile = () =>
  typeof window !== "undefined" && window.innerWidth <= 767;

/** Create the audio graph once. Safe to call repeatedly (idempotent). */
export function initAudioGraph(el: HTMLMediaElement | null): boolean {
  if (!el) return false;
  if (graph) return graph.el === el;
  const AC: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return false;
  let ctx: AudioContext;
  let source: MediaElementAudioSourceNode;
  try {
    ctx = new AC();
    // createMediaElementSource throws if already created for this element.
    source = ctx.createMediaElementSource(el);
  } catch {
    return false;
  }
  const analyser = ctx.createAnalyser();
  analyser.fftSize = isMobile() ? PULSE.fftSizeMobile : PULSE.fftSizeDesktop;
  analyser.smoothingTimeConstant = PULSE.smoothing;
  // audio element -> MediaElementSource -> Analyser -> destination
  source.connect(analyser);
  analyser.connect(ctx.destination);
  graph = {
    ctx,
    source,
    analyser,
    freq: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)), // reused every frame
    el,
  };
  if (!visibilityHooked) {
    visibilityHooked = true;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) zeroOut();
    });
  }
  return true;
}

/** Resume the context (must follow a user gesture on Safari). */
export function resumeAudio(): void {
  if (graph && graph.ctx.state === "suspended") graph.ctx.resume().catch(() => {});
  telemetry.audioState = graph ? graph.ctx.state : "none";
}

/** Real playback started/stopped — drives the fade envelope. */
export function setPlaying(on: boolean): void {
  playingTarget = on;
  telemetry.playing = on;
  if (on && !externalDriver) startInternal();
}

/** The Monogram loop claims/releases the single rAF driver. */
export function setExternalDriver(on: boolean): void {
  externalDriver = on;
  if (on) stopInternal();
  else if (playingTarget || env > 0.001) startInternal();
}

/** Smoothed bands already scaled by the fade envelope (0 when silent/paused). */
export function getBands(): { bass: number; mid: number; high: number } {
  return {
    bass: bands.bass * env,
    mid: bands.mid * env,
    high: bands.high * env,
  };
}

/** Reused array of the spatially-blended band energies (0..1, low freq -> high,
 *  NOT env-scaled; the shader applies the fade). Feeds the continuous field. */
export function getHeatmap(): Float32Array {
  return hmField;
}
/** Play/pause fade envelope (0..1) — the heatmap uses it for fade in/out. */
export function getEnv(): number {
  return env;
}

/**
 * Build the desktop spectral heatmap from the SAME analyser FFT: log-mapped bands
 * (left = sub/bass -> right = treble, NOT mirrored) with gate + adaptive
 * normalization + perceptual curve, per-band viscous attack/release + brief peak
 * hold, then a spatial gaussian blur across bands so no individual bin is
 * recognisable — a few soft masses. Everything writes into pre-allocated arrays.
 */
function computeHeatmap(dtMs: number, running: boolean): void {
  const dt = dtMs / 1000;
  const active =
    running &&
    EFFECTS.ENABLE_DESKTOP_SPECTRAL_HEATMAP &&
    typeof window !== "undefined" &&
    window.innerWidth >= HEATMAP.minWidthPx &&
    !!graph;
  telemetry.hmActive = active && env > 0.01;

  if (active) {
    const freq = graph!.freq;
    const bins = freq.length;
    const loBin = Math.max(1, Math.floor(HEATMAP.loBinFrac * bins));
    const hiBin = Math.min(bins - 1, Math.floor(HEATMAP.hiBinFrac * bins));
    const ratio = hiBin / loBin;
    // raw per band + running normalization peak
    let framePeak = 0;
    for (let i = 0; i < HM_N; i++) {
      const b0 = Math.floor(loBin * Math.pow(ratio, i / HM_N));
      const b1 = Math.max(b0 + 1, Math.floor(loBin * Math.pow(ratio, (i + 1) / HM_N)));
      let s = 0;
      for (let b = b0; b < b1; b++) s += freq[b];
      const raw = s / (b1 - b0) / 255;
      if (raw > framePeak) framePeak = raw;
      hmRaw[i] = raw;
    }
    hmNorm = Math.max(framePeak, hmNorm * HEATMAP.normDecay);
    if (hmNorm < HEATMAP.normFloor) hmNorm = HEATMAP.normFloor;
    const g = HEATMAP.noiseGate;
    const divisor = hmNorm * HEATMAP.normHeadroom;
    for (let i = 0; i < HM_N; i++) {
      const raw = hmRaw[i];
      const norm = Math.min(1, raw / divisor);
      const gated = norm < g ? 0 : (norm - g) / (1 - g);
      const target = Math.pow(gated, HEATMAP.perceptualExp);
      const cur = hmSmooth[i];
      // bass (low i) rises a touch faster
      const aRate =
        i < HM_N * 0.25 ? HEATMAP.attackRateBass : HEATMAP.attackRate;
      if (target >= cur) {
        hmSmooth[i] = cur + (target - cur) * (1 - Math.exp(-aRate * dt));
      } else {
        hmSmooth[i] = cur + (target - cur) * (1 - Math.exp(-HEATMAP.releaseRate * dt));
      }
    }
  } else {
    // Decay smoothly to zero (no FFT read).
    for (let i = 0; i < HM_N; i++)
      hmSmooth[i] += (0 - hmSmooth[i]) * (1 - Math.exp(-HEATMAP.releaseRate * dt));
  }

  spatialBlur();
}

/** Gaussian blur across bands (radius by smoothing level) so adjacent bands melt
 *  into a continuous field — no recognisable columns. Also fills telemetry. */
function spatialBlur(): void {
  const r = HEATMAP.smoothRadius[HEATMAP.smoothing] ?? 4;
  const sigma = Math.max(0.5, r);
  let peak = 0;
  for (let i = 0; i < HM_N; i++) {
    let acc = 0;
    let wsum = 0;
    for (let k = -r; k <= r; k++) {
      const j = i + k;
      if (j < 0 || j >= HM_N) continue;
      const w = Math.exp(-(k * k) / (2 * sigma * sigma));
      acc += hmSmooth[j] * w;
      wsum += w;
    }
    const v = wsum > 0 ? acc / wsum : 0;
    hmField[i] = v;
    if (v > peak) peak = v;
  }
  // telemetry: broad groups (sub/bass/mid/high) as averages of the field
  const grp = (a: number, b: number) => {
    let s = 0;
    const i0 = Math.floor(a * HM_N);
    const i1 = Math.max(i0 + 1, Math.floor(b * HM_N));
    for (let i = i0; i < i1; i++) s += hmField[i];
    return s / (i1 - i0);
  };
  telemetry.hmSub = grp(0, 0.12);
  telemetry.hmBass = grp(0.12, 0.32);
  telemetry.hmMid = grp(0.32, 0.62);
  telemetry.hmHigh = grp(0.62, 1);
  telemetry.hmPeak = peak;
  telemetry.hmBands = HM_N;
}

function avgRange(a: Uint8Array<ArrayBuffer>, from: number, to: number): number {
  let s = 0;
  const lo = Math.max(0, Math.floor(a.length * from));
  const hi = Math.min(a.length, Math.ceil(a.length * to));
  for (let i = lo; i < hi; i++) s += a[i];
  return hi > lo ? s / (hi - lo) / 255 : 0;
}

function smoothTo(cur: number, target: number, dt: number): number {
  const rate = target > cur ? PULSE.attackRate : PULSE.releaseRate;
  return cur + (target - cur) * (1 - Math.exp(-rate * dt));
}

/**
 * raw (0..1) -> adaptive-normalized (divided by a slow running peak so quiet and
 * loud masters both fill the range) -> noise-gated -> perceptual curve. Returns
 * [normalized, curved]; also advances the per-band peak.
 */
function shape(raw: number, band: "bass" | "mid" | "high"): [number, number] {
  peaks[band] = Math.max(raw, peaks[band] * PULSE.peakDecay);
  if (peaks[band] < PULSE.peakFloor) peaks[band] = PULSE.peakFloor;
  const norm = Math.min(1, raw / peaks[band]);
  const gated =
    norm < PULSE.noiseGate ? 0 : (norm - PULSE.noiseGate) / (1 - PULSE.noiseGate);
  return [norm, Math.pow(gated, PULSE.perceptualExp)];
}

function writeOut(barEnabled: boolean): void {
  // Player-bar micro-waveform level, scaled by the runtime intensity (relative
  // to the 2.5x preview default) so OFF/1x/2.5x/4x visibly change the bar too.
  const level = bands.bass * 0.65 + bands.mid * 0.35;
  const bar = barEnabled
    ? Math.min(1, level * env * (PULSE.sonicIntensity / 2.5) * PULSE.barGain)
    : 0;
  document.documentElement.style.setProperty("--pulse-bar", bar.toFixed(3));
  telemetry.bass = bands.bass * env;
  telemetry.mid = bands.mid * env;
  telemetry.high = bands.high * env;
  telemetry.pulseStrength = level * env;
  telemetry.sonicIntensity = PULSE.sonicIntensity;
  telemetry.audioState = graph ? graph.ctx.state : "none";
}

function zeroOut(): void {
  bands.bass = bands.mid = bands.high = 0;
  env = 0;
  document.documentElement.style.setProperty("--pulse-bar", "0");
  telemetry.bass = telemetry.mid = telemetry.high = 0;
  telemetry.rawBass = telemetry.rawMid = telemetry.rawHigh = 0;
  telemetry.normBass = telemetry.normMid = telemetry.normHigh = 0;
  telemetry.pulseStrength = 0;
}

/**
 * Per-frame update. Called either by the Monogram loop (external driver) or by
 * the internal rAF. dtSec is real elapsed time so everything is frame-rate
 * independent. Cheap no-op when the feature is disabled.
 */
export function tick(dtSec: number): void {
  const wantPulse = EFFECTS.ENABLE_SONIC_PULSE;
  const wantHeatmap = EFFECTS.ENABLE_DESKTOP_SPECTRAL_HEATMAP;
  if (!wantPulse && !wantHeatmap) {
    if (env !== 0 || bands.bass !== 0) zeroOut();
    computeHeatmap(0, false); // settle heatmap to zero
    return;
  }
  const dt = Math.min(0.05, Math.max(0, dtSec));
  // Fade envelope toward the play state (shared by pulse + spectrum).
  const running = !!graph && graph.ctx.state === "running";
  const envTarget = playingTarget && running ? 1 : 0;
  const fadeRate = 1000 / (envTarget > env ? PULSE.fadeInMs : PULSE.fadeOutMs);
  env += (envTarget - env) * (1 - Math.exp(-fadeRate * dt));
  if (env < 0.0005) env = envTarget === 0 ? 0 : env;

  if (running) {
    graph!.analyser.getByteFrequencyData(graph!.freq); // ONE FFT read, shared
    const rawBass = avgRange(graph!.freq, 0, 0.08);
    const rawMid = avgRange(graph!.freq, 0.08, 0.35);
    const rawHigh = avgRange(graph!.freq, 0.35, 0.8);
    const [nBass, cBass] = shape(rawBass, "bass");
    const [nMid, cMid] = shape(rawMid, "mid");
    const [nHigh, cHigh] = shape(rawHigh, "high");
    bands.bass = smoothTo(bands.bass, cBass, dt);
    bands.mid = smoothTo(bands.mid, cMid, dt);
    bands.high = smoothTo(bands.high, cHigh, dt);
    telemetry.rawBass = rawBass;
    telemetry.rawMid = rawMid;
    telemetry.rawHigh = rawHigh;
    telemetry.normBass = nBass;
    telemetry.normMid = nMid;
    telemetry.normHigh = nHigh;
  } else {
    bands.bass = smoothTo(bands.bass, 0, dt);
    bands.mid = smoothTo(bands.mid, 0, dt);
    bands.high = smoothTo(bands.high, 0, dt);
  }
  writeOut(wantPulse);
  computeHeatmap(dt * 1000, running); // reuses the SAME freq data
}

function internalLoop(now: number): void {
  const dt = internalLast ? (now - internalLast) / 1000 : 0.016;
  internalLast = now;
  tick(dt);
  // Keep spinning only while there is something to animate.
  if (!externalDriver && (playingTarget || env > 0.001)) {
    internalRaf = requestAnimationFrame(internalLoop);
  } else {
    internalRaf = 0;
  }
}

function startInternal(): void {
  if (internalRaf || externalDriver) return;
  internalLast = 0;
  internalRaf = requestAnimationFrame(internalLoop);
}

function stopInternal(): void {
  if (internalRaf) cancelAnimationFrame(internalRaf);
  internalRaf = 0;
}
