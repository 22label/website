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
  ENABLE_DESKTOP_SPECTRAL_HEATMAP: true, // desktop-only continuous thermal field
  ENABLE_MOBILE_TACTILE_PRESSURE: true, // mobile-only liquid touch (press + ripple)
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

  // Per-effect 1x base gain (shared) — offset = min(bp.clamp, band * base * bp.intensity).
  bgPulseBase: 0.03,
  refractPulseBase: 0.038,
  scalePulseBase: 0.013,
  specPulseBase: 0.04,
  depthBase: 10, // world-unit z "mass" push (ortho camera -> subtle)
  // Breakpoint calibration: mobile is ~70% of the potentiated desktop, with its
  // own visible ceilings. `intensity` is the runtime OFF/…/x control per device.
  desktop: {
    intensity: 2.5, // runtime OFF/1/2.5/4
    bgClamp: 0.08, // background brightness up to 8%
    refractClamp: 0.1, // refraction breath up to 10%
    scaleClamp: 0.035, // monogram mass up to +3.5% (1.035)
    specClamp: 0.12, // specular up to +12%
    depthClamp: 26,
    barGain: 1.0, // player-bar --pulse-bar scaling (~4px)
  },
  // Mobile is now clearly perceptible (default 2.5×, matching desktop's runtime
  // gain), with its own visible ceilings raised per the mobile calibration:
  // background 7–9%, refraction +8–12%, monogram +2.8–3.8%, specular +10–14%,
  // local RGB/high +6–10%, player bar ≤3px. Attack/release + perceptual curve
  // are shared (PULSE.attackRate/releaseRate/perceptualExp) — no layout shift.
  mobile: {
    intensity: 2.5, // runtime OFF/1/1.75/2.5/3.5 — default 2.5×
    bgClamp: 0.09, // 7–9% background pulse on the bass
    refractClamp: 0.12, // +8–12% refraction breathing
    scaleClamp: 0.038, // +2.8–3.8% monogram mass (1.028–1.038)
    specClamp: 0.14, // +10–14% specular on the mids
    depthClamp: 22, // more evident depth push (still subtle, ortho camera)
    barGain: 1.1, // player bar ≤3px (bar is ~113px on mobile)
  },
};

/** Runtime setters for the debug panel's per-breakpoint Sonic-intensity. */
export function setSonicIntensity(v: number): void {
  PULSE.desktop.intensity = v;
}
export function setMobileSonicIntensity(v: number): void {
  PULSE.mobile.intensity = v;
}

// ----------------------------------------- DESKTOP SPECTRAL HEATMAP (thermal field)
// A single continuous, soft energy field at the bottom of the desktop viewport —
// NO bars/lines/skyline. ~40 perceptual bands feed a spatially-blended surface;
// colour is a vertical green->yellow->orange->red gradient driven by intensity.
export const HEATMAP = {
  numBands: 40, // internal perceptual bands (left=low freq -> right=high). Never shown as columns.
  minWidthPx: 1024, // desktop LIVE gate — the continuous field renders on desktop above this width
  maxHeightPx: 100, // desktop runtime (60 / 80 / 100) — hard clamp
  // Mobile is fed by the precomputed spectrum (no AudioContext dependency) and
  // sized responsively: clamp(56px, 10dvh, 100px). It renders full-width at the
  // bottom, refracted through the liquid glass, at a clearly-visible opacity.
  mobileMinHeightPx: 56,
  mobileMaxHeightPx: 100,
  mobileHeightVh: 0.1, // 10dvh
  mobileOpacity: 0.55, // runtime 0.25/0.40/0.55/0.70 — 50–60% default, clearly visible
  intensity: 1.0, // runtime 0.5/1/1.5/2 — scales the field height (both breakpoints)
  opacity: 0.52, // runtime 0.25/0.40/0.55/0.70 master opacity
  smoothing: 2, // runtime spatial smoothing 0=LOW 1=MEDIUM 2=HIGH (band-blur radius)
  smoothRadius: [1, 2, 4] as const, // band-blur radius per smoothing level
  // Vertical thermal palette (reference): green -> lime -> yellow -> orange -> red
  colorLow: [0x28 / 255, 0xff / 255, 0x52 / 255] as [number, number, number], // #28FF52
  colorLowMid: [0x9d / 255, 0xff / 255, 0x36 / 255] as [number, number, number], // #9DFF36
  colorMid: [0xf2 / 255, 0xd3 / 255, 0x37 / 255] as [number, number, number], // #F2D337
  colorHigh: [0xff / 255, 0x7a / 255, 0x24 / 255] as [number, number, number], // #FF7A24
  colorPeak: [0xff / 255, 0x00 / 255, 0x04 / 255] as [number, number, number], // #FF0004
  topFadeStart: 0.82, // upper dissolve only near the very top (keeps peaks vivid)
  surfaceSoftPx: 9, // soft thickness of the undulating top surface
  heatShift: 0.13, // heatProgress pushes palette toward orange/red by up to +13%
  // Frequency mapping — perceptual/log (fractions of binCount).
  loBinFrac: 0.001,
  hiBinFrac: 0.42,
  // Per-band temporal dynamics (viscous). Bass rises a touch faster.
  attackRate: 9, // ~110ms
  releaseRate: 2.2, // ~450ms
  attackRateBass: 12, // bass a bit snappier
  peakHoldMs: 90, // slight peak persistence
  noiseGate: 0.045,
  perceptualExp: 0.82,
  normDecay: 0.9992,
  normFloor: 0.08,
  normHeadroom: 1.3,
};

// ------------------------------------------ MOBILE TACTILE PRESSURE / LIQUID TOUCH
// Touch on the monogram -> soft optical depression; hold -> local refraction ramp;
// release -> a single expanding ripple + a very short haptic where supported. A
// purely local, temporary offset in the existing glass shader (no geometry edits,
// no new loop/pass/texture). Never touches heat / rotation / scroll.
export const TACTILE = {
  mobileMaxWidth: 767, // mobile-only (<= this width)
  // touch -> drag/scroll discrimination
  moveThresholdPx: 11, // move beyond this BEFORE activation => it's a drag/scroll
  cancelThresholdPx: 24, // move beyond this DURING an active press => cancel
  holdActivationMs: 220, // runtime 180 / 220 / 280
  tapMaxMs: 180, // below this on release = a small tap ripple
  holdToMaxMs: 850, // time under continuous hold to reach max local refraction
  // envelopes (per-second exp rates, frame-rate independent)
  pressAttackRate: 12, // press-in ease (~230ms)
  pressReleaseRate: 20, // quick return on release
  holdReleaseRate: 15, // hold-refraction decay on release
  // local maxima at full hold (fractions)
  radius: 0.16, // normalized-height falloff radius (~12–20% of the monogram)
  dispMax: 0.05, // inward refraction pull (the soft depression)
  refractMax: 0.2, // +20% local refraction (target 15–22%)
  rgbMax: 0.09, // +9% local RGB separation
  specMax: 0.11, // +11% local specular
  // ripple (single, math-only in the shader)
  rippleDurationMs: 720, // 550–850ms
  tapRippleDurationMs: 340,
  rippleMaxRadius: 0.62, // normalized-height max radius
  rippleWidth: 0.06, // soft ring width (~5–10% of radius)
  rippleRefractMax: 0.16, // +16%
  rippleRgbMax: 0.08, // +8%
  rippleSpecMax: 0.08, // +8%
  rippleDispMax: 0.03,
  tapRippleScale: 0.5, // smaller/lighter ripple for taps
  overshoot: 0.025, // <=3% elastic overshoot on surface return
  overshootMs: 180,
  hapticMs: 8, // 6–10ms single pulse (Android; iOS usually ignores)
  reducedMotionScale: 0.2, // strong reduction under prefers-reduced-motion (no ripple/haptic)
  // runtime intensities (debug panel)
  pressureIntensity: 1.0, // OFF/0.5/1/1.5
  rippleIntensity: 1.0, // OFF/0.5/1/1.5
};

/** Runtime setters for the debug panel's tactile controls. */
export function setTactilePressureIntensity(v: number): void {
  TACTILE.pressureIntensity = v;
}
export function setTactileRippleIntensity(v: number): void {
  TACTILE.rippleIntensity = v;
}
export function setTactileHoldMs(v: number): void {
  TACTILE.holdActivationMs = v;
}

/** Runtime setters for the debug panel's heatmap controls. */
export function setHeatmapIntensity(v: number): void {
  HEATMAP.intensity = v;
}
export function setHeatmapMaxHeight(v: number): void {
  HEATMAP.maxHeightPx = v;
}
export function setHeatmapSmoothing(v: number): void {
  HEATMAP.smoothing = v;
}
export function setHeatmapOpacity(v: number): void {
  HEATMAP.opacity = v;
}
export function setHeatmapMobileOpacity(v: number): void {
  HEATMAP.mobileOpacity = v;
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
  // --- Audio pipeline mode (LIVE_WEB_AUDIO desktop / PRECOMPUTED_MOBILE) -------
  mode: "LIVE_WEB_AUDIO" as string,
  // Mobile DIRECT_HTML_MEDIA playback (HTMLAudioElement, media channel)
  mediaPaused: true,
  mediaMuted: false,
  mediaVolume: 0,
  mediaCurrentTime: 0,
  mediaDuration: 0,
  mediaReadyState: 0,
  mediaError: "" as string,
  // Mobile PRECOMPUTED analysis
  analysisLoaded: false,
  analysisFrame: 0,
  analysisFps: 0,
  mBass: 0,
  mMid: 0,
  mHigh: 0,
  mRms: 0,
  mPeak: 0,
  // Gapless playback
  audioSourceCount: 0, // audible sources (must always be 0 or 1)
  audioOffset: 0, // current loop offset (s)
  loopStart: 0,
  loopEnd: 0,
  loopDuration: 0,
  // Desktop spectral heatmap
  hmSub: 0, // energy 0..1 per broad group
  hmBass: 0,
  hmMid: 0,
  hmHigh: 0,
  hmPeak: 0, // normalized peak band (0..1)
  hmMaxHeightPx: 0, // tallest column in px (<= maxHeightPx)
  hmBands: 40,
  hmIntensity: 1,
  hmMaxCfg: 100,
  hmSmoothing: 2,
  hmOpacity: 0.52,
  hmActive: false, // rendered right now (desktop + on + audio)
  hmMounted: false, // heatmap shader path is live for this breakpoint
  hmHeightPx: 0, // resolved field max height in CSS px (per breakpoint)
  hmRenderOrder: -1, // background plane renderOrder (heatmap is drawn on it)
  // Mobile tactile pressure / liquid touch
  tacCandidate: false,
  tacActive: false,
  tacScrollCancelled: false,
  tacTouchX: 0,
  tacTouchY: 0,
  tacHitMonogram: false,
  tacHoldMs: 0,
  tacPressStrength: 0,
  tacRefractBoost: 0,
  tacRippleProgress: 0, // -1 when inactive
  tacRippleRadius: 0,
  tacHapticSupported: false,
  tacPressureIntensity: 1,
  tacRippleIntensity: 1,
  tacHoldActivationMs: 220,
};
