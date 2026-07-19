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
  fftSizeDesktop: 512,
  fftSizeMobile: 256,
  smoothing: 0.85, // AnalyserNode.smoothingTimeConstant
  bassGain: 1.0,
  midGain: 1.0,
  highGain: 1.0,
  noiseGate: 0.06, // normalized level below which a band reads 0 (kills silence jitter)
  attackRate: 18, // per-second exp rise (fast)
  releaseRate: 4, // per-second exp fall (soft)
  fadeInMs: 500, // 400–600ms envelope in when playback really starts
  fadeOutMs: 650, // 500–800ms envelope out on pause/OFF
  // Scene modulations (all additive, tiny)
  bgPulseMax: 0.03, // 3% background brightness
  refractionPulseMax: 0.03, // 3% refraction breath
  monogramScaleMax: 0.012, // uniform scale up to +1.2% (within 1.005–1.015)
  playerBarPulseMax: 1.0, // drives the --pulse-bar CSS var 0..1 (CSS maps to look)
};

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
  bass: 0,
  mid: 0,
  high: 0,
  heat: 0,
  dpr: 0,
  fps: 0,
  audioState: "none" as string,
  playing: false,
};
