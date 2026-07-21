/**
 * AUDIO WAVEFORM V2 — a 3D dotted spectral waveform.
 *
 * Parallel flowing rows of luminous points form one smooth audio surface with
 * peaks/valleys, depth and faked perspective (the scene camera is orthographic,
 * so the receding look is baked into per-row x-scale / y-rise / point-size).
 * Spectral bands map across X; multiple ordered Z rows form a scrolling history
 * (newest at the front row, propagating back) driven by the SHARED audio
 * pipeline (getHeatmap()/getEnv()). A restrained idle sine keeps it sculptural
 * when silent. Spectral palette across X: red → orange → yellow → green → cyan →
 * blue, additive on black. This replaces ONLY the thermal heatmap's on-screen
 * visualization when the V2 variant is active; the audio data is unchanged.
 *
 * THREE is passed in (not imported) so this module never statically bundles
 * three — Monogram loads it via dynamic import and hands the instance here.
 * Lifecycle: create / update / resize / dispose, no per-frame allocation.
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
  attribute float aU; // 0..1 column (spectral band position)
  attribute float aV; // 0..1 row (0 = front / newest, 1 = back / oldest)
  uniform sampler2D uField; // NX x NZ amplitude history (.r, 0..1)
  uniform float uWidth, uBottomY, uHeight, uDepthFront, uDepthBack;
  uniform float uRowRise, uRowShrink, uAmp, uIdleAmp, uIdleSpeed, uTime;
  uniform float uPointSize, uDpr;
  varying float vAmp;
  varying float vU;
  varying float vV;
  void main() {
    float xScale = 1.0 - aV * uRowShrink;               // back rows narrower
    float x = (aU - 0.5) * uWidth * xScale;
    float z = mix(uDepthFront, uDepthBack, aV);           // recede behind glass
    float amp = texture2D(uField, vec2(aU, aV)).r;        // audio displacement
    float idle = sin(aU * 7.0 + uTime * uIdleSpeed + aV * 3.1416) * uIdleAmp;
    float y = uBottomY + aV * uHeight * uRowRise + amp * uAmp + idle;
    vAmp = amp;
    vU = aU;
    vV = aV;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(x, y, z, 1.0);
    gl_PointSize = max(1.0, uPointSize * uDpr * (1.0 - aV * 0.45));
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  varying float vAmp;
  varying float vU;
  varying float vV;
  uniform float uBrightness;
  vec3 hsv2rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
    return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
  }
  void main() {
    vec2 pc = gl_PointCoord - 0.5;
    float d = length(pc);
    if (d > 0.5) discard;                                 // round dots
    float soft = smoothstep(0.5, 0.12, d);
    float hue = vU * 0.666;                               // red(0) -> blue(0.666)
    vec3 col = hsv2rgb(vec3(hue, 0.9, 1.0));
    float bright = uBrightness * (0.30 + vAmp * 1.1) * (1.0 - vV * 0.30);
    gl_FragColor = vec4(col * bright, soft * (0.45 + vAmp * 0.55));
  }
`;

export function createSpectralWaveformV2(
  three: typeof import("three"),
  opts: { vw: number; vh: number; isMobile: boolean; dpr: number },
): SpectralWaveformV2 {
  const cfg = AUDIO_WAVEFORM;
  const NX = opts.isMobile ? cfg.columnsMobile : cfg.columnsDesktop;
  const NZ = opts.isMobile ? cfg.rowsMobile : cfg.rowsDesktop;
  const COUNT = NX * NZ;

  // Normalized column/row attributes; the real position is computed in the
  // vertex shader from uniforms (so resize is a uniform update, not a rebuild).
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

  // Amplitude history texture: NX (width) x NZ (height), single R channel.
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

  const uniforms = {
    uField: { value: fieldTex },
    uWidth: { value: opts.vw * cfg.widthFrac },
    uBottomY: { value: -opts.vh / 2 + opts.vh * cfg.bottomMarginFrac },
    uHeight: { value: opts.vh * cfg.heightFrac },
    uDepthFront: { value: cfg.depthFront },
    uDepthBack: { value: cfg.depthBack },
    uRowRise: { value: cfg.rowRiseFrac },
    uRowShrink: { value: cfg.rowShrink },
    uAmp: { value: cfg.ampPx },
    uIdleAmp: { value: cfg.idleAmpPx },
    uIdleSpeed: { value: cfg.idleSpeed },
    uTime: { value: 0 },
    uPointSize: { value: cfg.pointSize },
    uDpr: { value: Math.min(opts.dpr, 2) },
    uBrightness: { value: cfg.brightness },
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

  const points = new three.Points(geometry, material);
  points.renderOrder = -1; // background layer (behind the monogram)
  points.frustumCulled = false; // positions live in the shader

  // Reused scratch — no per-frame allocation.
  const smooth = new Float32Array(NX);

  const resample = (field: Float32Array) => {
    const n = field.length; // e.g. 40 perceptual bands
    for (let c = 0; c < NX; c++) {
      const f = NX > 1 ? (c / (NX - 1)) * (n - 1) : 0;
      const i0 = Math.floor(f);
      const i1 = Math.min(n - 1, i0 + 1);
      const t = f - i0;
      smooth[c] = field[i0] * (1 - t) + field[i1] * t;
    }
  };

  const update = (f: { dtSec: number; time: number; reducedMotion: boolean }) => {
    if (f.reducedMotion) {
      // Static, sculptural: freeze time; keep the (flat) history so only the
      // idle sine at t=0 shapes the surface. No autonomous deformation.
      uniforms.uTime.value = 0;
      return;
    }
    uniforms.uTime.value = f.time;
    const field = getHeatmap(); // shared 40-band spectral field (0..1)
    const env = getEnv(); // play/pause fade envelope (0 when silent)
    resample(field);
    // Scroll history back one row (row r <- row r-1); newest goes to row 0.
    fieldData.copyWithin(NX, 0, NX * (NZ - 1));
    for (let c = 0; c < NX; c++) {
      const v = smooth[c] * env;
      fieldData[c] = v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255);
    }
    fieldTex.needsUpdate = true;
  };

  const resize = (vw: number, vh: number) => {
    uniforms.uWidth.value = vw * cfg.widthFrac;
    uniforms.uBottomY.value = -vh / 2 + vh * cfg.bottomMarginFrac;
    uniforms.uHeight.value = vh * cfg.heightFrac;
  };

  const dispose = () => {
    geometry.dispose();
    material.dispose();
    fieldTex.dispose();
  };

  return { object3D: points, update, resize, dispose };
}
