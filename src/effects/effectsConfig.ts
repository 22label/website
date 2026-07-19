/**
 * Central calibration for the two experimental interactions (Frequency Field +
 * Sonic Pulse). Everything is intentionally subtle. All magic numbers live here
 * so the effects can be tuned or disabled from ONE place — no values scattered
 * across shaders/components.
 *
 * The two `ENABLE_*` flags are the master switches. They are mutable at runtime
 * so the `?debugEffects=1` panel can flip them live; the WebGL loop / audio
 * engine read them every frame. When a flag is off every derived offset is 0,
 * so the approved scene is byte-for-byte unchanged.
 */
export const EFFECTS = {
  ENABLE_FREQUENCY_FIELD: true,
  ENABLE_SONIC_PULSE: true,
};

// ---------------------------------------------------------------- FREQUENCY FIELD
export const FIELD = {
  desktopStrength: 1.0, // master multiplier (desktop)
  mobileStrength: 0.65, // ~65% on mobile
  radius: 0.3, // normalized-screen falloff radius (wide, soft)
  pointerDamping: 6.5, // per-second smoothing rate for fieldPosition (higher = snappier)
  velocityDamping: 5.0, // per-second decay of the movement-driven strength ramp
  decayMs: 850, // strength decay back to 0 once the pointer holds still (700–1000ms)
  // Monogram parallax (additive to the scroll rotation — never overrides it)
  monogramRotMaxDeg: 2.5, // extra X/Y rotation at full field
  monogramDepthMax: 10, // extra world-units of depth push at full field
  // Marquee local distortion
  marqueeDispMaxPxDesktop: 8, // 4–10px
  marqueeDispMaxPxMobile: 5, // 3–6px
  marqueeScaleMax: 0.025, // 2.5% local scale variation
  // Refraction / light (glass) — local, near the field only
  refractionBoostMax: 0.13, // +13% refraction/dispersion offset near the field
  specularBoostMax: 0.08, // +8% specular
  // Background glow (marquee shader) — extremely subtle additive halo
  bgGlowMax: 0.04, // max 4% opacity
  bgGlowColorCold: [0xb0 / 255, 0xc7 / 255, 0xfd / 255] as [number, number, number], // #B0C7FD
};

// ------------------------------------------------------------------- SONIC PULSE
export const PULSE = {
  // Runtime master gain for the whole Sonic Pulse — the ?debugEffects panel
  // switches it between OFF(0) / 1x / 2.5x / 4x. Preview default is 2.5x so the
  // audio reaction is clearly visible. It scales ONLY the audio scene offsets
  // (never heat / Frequency Field / base refraction).
  sonicIntensity: 2.5,

  fftSizeDesktop: 1024,
  fftSizeMobile: 512,
  smoothing: 0.8, // AnalyserNode.smoothingTimeConstant (its own light smoothing)

  // Dynamics — fast attack, soft release, both frame-rate independent.
  attackRate: 14, // per-second exp rise (~70ms)
  releaseRate: 2.5, // per-second exp fall (~400ms)
  noiseGate: 0.04, // normalized floor below which a band reads 0 (lowered)
  perceptualExp: 0.75, // pow(value, exp) so mid levels stay visible
  // Adaptive per-band normalization to the track's real level (auto-levels a
  // quiet vs loud master). A slowly-decaying running peak divides each band.
  peakDecay: 0.9992, // per-frame decay of the running peak (slow)
  peakFloor: 0.1, // minimum peak, so silence/noise isn't amplified to full

  fadeInMs: 500, // 400–600ms envelope in when playback really starts
  fadeOutMs: 650, // 500–800ms envelope out on pause/OFF

  // Per-effect 1x base gain and a hard visible clamp (the ceiling at any
  // intensity). offset = min(clamp, band * base * sonicIntensity).
  bgPulseBase: 0.03,
  bgPulseClamp: 0.08, // background brightness up to 8%
  refractPulseBase: 0.038,
  refractPulseClamp: 0.1, // refraction breath up to 10%
  scalePulseBase: 0.013,
  scalePulseClamp: 0.035, // monogram mass up to +3.5% (1.035)
  specPulseBase: 0.04,
  specPulseClamp: 0.12, // mid-driven specular up to +12%
  depthBase: 10, // world-unit z "mass" push (ortho camera -> subtle)
  depthClamp: 26,
  barGain: 1.0, // multiplier for the --pulse-bar CSS value (0..1)
};

/** Runtime setter for the debug panel's Sonic-intensity control. */
export function setSonicIntensity(v: number): void {
  PULSE.sonicIntensity = v;
}

// ------------------------------------------------------- GLOBAL SAFETY CLAMPS (§3)
// finalValue = base + heatOffset + fieldOffset + audioOffset, hard-capped here so
// the sum of all effects at maximum still reads premium and legible.
export const CLAMP = {
  refractionOffset: 0.16, // max fractional refraction increase from field+audio
  specularOffset: 0.1,
  monogramScale: 0.02, // max +2% total scale
  parallaxRad: (3.5 * Math.PI) / 180, // max ~3.5° total parallax
  bgBrightness: 0.05, // max +5% background brightness
  bgGlow: 0.05,
};

/**
 * Live, read-only-ish telemetry for the debug panel. The loop / audio engine
 * write plain numbers here (no allocation); the panel samples it on a slow
 * interval (NOT per frame). Never used to drive visuals.
 */
export const telemetry = {
  fieldStrength: 0,
  // smoothed (post curve/normalize/env) bands — these drive the visuals
  bass: 0,
  mid: 0,
  high: 0,
  // raw (0..1 straight off the analyser) and normalized (adaptive) bands
  rawBass: 0,
  rawMid: 0,
  rawHigh: 0,
  normBass: 0,
  normMid: 0,
  normHigh: 0,
  pulseStrength: 0, // final overall Sonic Pulse strength (0..1, incl. env)
  bgOffset: 0, // applied background brightness offset
  refractOffset: 0, // applied refraction breath offset
  monoScale: 1, // applied final monogram scale multiplier
  sonicIntensity: 2.5,
  heat: 0,
  dpr: 0,
  fps: 0,
  audioState: "none" as string,
  playing: false,
};
