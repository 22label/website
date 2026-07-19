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
import { EFFECTS, PULSE, telemetry } from "./effectsConfig";

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

function writeOut(): void {
  // Player-bar micro-waveform level, scaled by the runtime intensity (relative
  // to the 2.5x preview default) so OFF/1x/2.5x/4x visibly change the bar too.
  const level = bands.bass * 0.65 + bands.mid * 0.35;
  const bar = Math.min(
    1,
    level * env * (PULSE.sonicIntensity / 2.5) * PULSE.barGain,
  );
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
  if (!EFFECTS.ENABLE_SONIC_PULSE) {
    if (env !== 0 || bands.bass !== 0) zeroOut();
    return;
  }
  const dt = Math.min(0.05, Math.max(0, dtSec));
  // Fade envelope toward the play state.
  const envTarget = playingTarget && !!graph && graph.ctx.state === "running" ? 1 : 0;
  const fadeRate = 1000 / (envTarget > env ? PULSE.fadeInMs : PULSE.fadeOutMs);
  env += (envTarget - env) * (1 - Math.exp(-fadeRate * dt));
  if (env < 0.0005) env = envTarget === 0 ? 0 : env;

  if (graph && graph.ctx.state === "running") {
    graph.analyser.getByteFrequencyData(graph.freq);
    const rawBass = avgRange(graph.freq, 0, 0.08);
    const rawMid = avgRange(graph.freq, 0.08, 0.35);
    const rawHigh = avgRange(graph.freq, 0.35, 0.8);
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
  writeOut();
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
