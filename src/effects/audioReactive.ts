/**
 * Sonic Pulse audio engine + gapless player — ONE AudioContext, ONE GainNode
 * (fixed 0.6), ONE AnalyserNode for the whole app. Playback is sample-accurate:
 * the MP3 is fetched + decodeAudioData'd ONCE into an AudioBuffer, a ~12ms
 * head-tail crossfade is baked in (once, not per-cycle) so the loop is seamless,
 * and it is played through an AudioBufferSourceNode with `loop=true`. The HTML
 * <audio loop> mechanism (not sample-accurate, gap on Safari/iOS) is gone.
 *
 * Chain: AudioBufferSourceNode -> GainNode(0.6) -> AnalyserNode -> destination.
 * The analyser (after the gain) feeds bass/mid/high (attack/release + gate + a
 * play/pause fade envelope) to the WebGL scene, and writes `--pulse-bar`.
 *
 * Pause/resume keeps the musical position: an AudioBufferSourceNode can only be
 * started once, so pause stops it (short fade, no click) and stores the current
 * loop offset from the AudioContext clock; resume creates a fresh source and
 * starts exactly at that offset. Route changes never touch playback. Only ONE
 * rAF ever runs (Monogram loop, or a tiny internal one off-Home).
 */
import { EFFECTS, HEATMAP, PULSE, telemetry } from "./effectsConfig";

const AUDIO_URL = "/audio/intruder-snippet.mp3";
const CROSSFADE_MS = 12; // baked head-tail crossfade to kill the junction click
const VOLUME = 0.6; // fixed base volume (unchanged)
const FADE_S = 0.008; // pause/resume click-guard fade

type Graph = {
  ctx: AudioContext;
  gain: GainNode;
  analyser: AnalyserNode;
  freq: Uint8Array<ArrayBuffer>;
  buffer: AudioBuffer | null; // seamless loop buffer (null until decoded)
  source: AudioBufferSourceNode | null; // the ONE playing source (or null)
  loopDuration: number; // seconds
};

let graph: Graph | null = null;
let decoding = false;
let resumeOffset = 0; // musical offset (s) to (re)start from
let srcStartCtxTime = 0; // ctx.currentTime when the current source started
let srcStartOffset = 0; // offset the current source started at
let wantPlay = false; // the app's desired state (should audio be playing?)
let autoplayOnce = true; // one-shot autoplay attempt at load (after decode)
let unlocked = false; // iOS Web Audio unlocked (silent buffer played in a gesture)
const playListeners = new Set<(p: boolean) => void>();
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

/** Bake a seamless loop: crossfade the tail into the head once, so the source's
 *  loop wrap (last sample -> first) is continuous and the junction never clicks.
 *  Sacrifices the final CROSSFADE_MS as blend material only. */
function makeSeamlessLoop(ctx: BaseAudioContext, src: AudioBuffer): AudioBuffer {
  const sr = src.sampleRate;
  const ch = src.numberOfChannels;
  const L = Math.min(Math.round((sr * CROSSFADE_MS) / 1000), src.length >> 2);
  const M = src.length - L; // loop length
  const out = ctx.createBuffer(ch, M, sr);
  for (let c = 0; c < ch; c++) {
    const s = src.getChannelData(c);
    const d = out.getChannelData(c);
    for (let i = L; i < M; i++) d[i] = s[i]; // bulk
    // head[0..L) = equal-power blend of tail (fading out) into head (fading in);
    // d[0] = tail start (=s[M]) so d[M-1](=s[M-1]) -> d[0](=s[M]) is continuous.
    for (let i = 0; i < L; i++) {
      const w = (i + 0.5) / L; // 0..1
      const wi = Math.sin((w * Math.PI) / 2); // head gain
      const wo = Math.cos((w * Math.PI) / 2); // tail gain
      d[i] = s[i] * wi + s[M + i] * wo;
    }
  }
  return out;
}

/** Create the single audio graph + start decoding the loop (idempotent). */
export function ensureAudio(): boolean {
  if (graph) return true;
  const AC: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return false;
  let ctx: AudioContext;
  try {
    ctx = new AC();
  } catch {
    return false;
  }
  const gain = ctx.createGain();
  gain.gain.value = VOLUME;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = isMobile() ? PULSE.fftSizeMobile : PULSE.fftSizeDesktop;
  analyser.smoothingTimeConstant = PULSE.smoothing;
  gain.connect(analyser);
  analyser.connect(ctx.destination);
  graph = {
    ctx,
    gain,
    analyser,
    freq: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)),
    buffer: null,
    source: null,
    loopDuration: 0,
  };
  if (!visibilityHooked) {
    visibilityHooked = true;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) zeroOut();
      else if (graph && graph.source && graph.ctx.state === "suspended")
        graph.ctx.resume().catch(() => {}); // resume playback returning to fg
    });
  }
  // Decode the loop once, off the audio thread.
  if (!decoding) {
    decoding = true;
    fetch(AUDIO_URL)
      .then((r) => r.arrayBuffer())
      .then((a) => ctx.decodeAudioData(a))
      .then((decoded) => {
        if (!graph) return;
        graph.buffer = makeSeamlessLoop(ctx, decoded);
        graph.loopDuration = graph.buffer.length / graph.buffer.sampleRate;
        telemetry.loopStart = 0;
        telemetry.loopEnd = graph.loopDuration;
        telemetry.loopDuration = graph.loopDuration;
        // One-shot autoplay: play ONLY if the browser allows audible autoplay
        // without a gesture. resume() stays pending until the context can run;
        // when it resolves, start only if NO user gesture unlocked it in the
        // meantime (`unlocked`) — otherwise that resume was gesture-driven and
        // playback must wait for the player toggle (no auto-start on a stray tap).
        if (autoplayOnce) {
          autoplayOnce = false;
          graph.ctx
            .resume()
            .then(() => {
              if (graph && graph.ctx.state === "running" && !unlocked) {
                wantPlay = true;
                reconcile();
              }
            })
            .catch(() => {});
        } else {
          reconcile(); // a toggle before decode set the desired state
        }
      })
      .catch(() => {
        decoding = false;
      });
  }
  return true;
}

function notifyPlaying(on: boolean): void {
  playingTarget = on;
  telemetry.playing = on;
  playListeners.forEach((cb) => cb(on));
  if (on && !externalDriver) startInternal();
}

/** Current musical offset (seconds) within the seamless loop. */
function currentOffset(): number {
  if (!graph || !graph.source) return resumeOffset;
  const elapsed = graph.ctx.currentTime - srcStartCtxTime;
  return (srcStartOffset + elapsed) % graph.loopDuration;
}

/** Create a fresh looping source at `offset` with a tiny fade-in. */
function startSource(offset: number): void {
  if (!graph || !graph.buffer || graph.source) return;
  const { ctx, gain, buffer } = graph;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.loopStart = 0;
  src.loopEnd = graph.loopDuration;
  src.connect(gain);
  const t = ctx.currentTime;
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(VOLUME, t + FADE_S);
  src.start(t, offset % graph.loopDuration);
  srcStartCtxTime = t;
  srcStartOffset = offset % graph.loopDuration;
  graph.source = src;
  notifyPlaying(true);
}

/** Stop the source keeping the musical position (short fade -> no click). */
function stopSource(): void {
  if (!graph || !graph.source) return;
  resumeOffset = currentOffset();
  const { ctx, gain } = graph;
  const s = graph.source;
  graph.source = null;
  const t = ctx.currentTime;
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(gain.gain.value, t);
  gain.gain.linearRampToValueAtTime(0.0001, t + FADE_S);
  try {
    s.stop(t + FADE_S + 0.005);
  } catch {
    /* ignore */
  }
  s.onended = () => {
    try {
      s.disconnect();
    } catch {
      /* ignore */
    }
  };
  notifyPlaying(false);
}

/** iOS Safari unlock: resume + start a 1-sample silent buffer SYNCHRONOUSLY in
 *  the gesture. Once the context is running it stays running, so a later
 *  (post-decode) real source start plays normally. */
function unlock(): void {
  if (!graph) return;
  graph.ctx.resume().catch(() => {});
  if (unlocked) return;
  try {
    const b = graph.ctx.createBuffer(1, 1, graph.ctx.sampleRate);
    const s = graph.ctx.createBufferSource();
    s.buffer = b;
    s.connect(graph.ctx.destination);
    s.start(0);
    s.onended = () => {
      try {
        s.disconnect();
      } catch {
        /* ignore */
      }
    };
    unlocked = true;
  } catch {
    /* ignore */
  }
}

/** Bring actual playback in line with the desired state `wantPlay` (starts or
 *  stops the single source). Starting even while the context is still resuming
 *  is fine — the buffered source plays as soon as the gesture-resume lands. */
function reconcile(): void {
  if (!graph || !graph.buffer) return;
  if (wantPlay && !graph.source) startSource(resumeOffset);
  else if (!wantPlay && graph.source) stopSource();
}

/** Resume the AudioContext on a valid user gesture (unlock for a later toggle).
 *  Does NOT auto-start playback — that stays the player button's job, so a first
 *  tap anywhere never surprises the user with music. MUST be called from within
 *  a gesture handler. */
export function userGesture(): void {
  ensureAudio();
  if (!graph) return;
  unlock(); // resume + silent-buffer unlock, in-gesture (iOS)
  telemetry.audioState = graph.ctx.state;
}

/** Mount autoplay intent (honoured once after decode; see ensureAudio). */
export function requestPlay(): void {
  ensureAudio();
}

/** Pause: stop the source, keep the position (no restart on resume). */
export function pausePlayback(): void {
  wantPlay = false;
  reconcile();
}

/** ON/OFF toggle used by the player control. Unlocks in-gesture, then flips the
 *  desired state and reconciles (iOS-safe: the source starts in the gesture). */
export function togglePlayback(): void {
  ensureAudio();
  if (!graph) return;
  autoplayOnce = false; // user is now in explicit control
  unlock(); // gesture unlock (resume + silent buffer)
  wantPlay = !isPlaying();
  reconcile();
}

/** Exactly one audible source ever. */
export function isPlaying(): boolean {
  return !!(graph && graph.source);
}

/** Subscribe to play-state changes (for React `playing`). Returns unsubscribe. */
export function subscribePlaying(cb: (p: boolean) => void): () => void {
  playListeners.add(cb);
  return () => playListeners.delete(cb);
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
  // Player-bar micro-waveform level, scaled by the per-breakpoint intensity so
  // the OFF/…/x control visibly changes the bar too (mobile bar is smaller).
  const bp = isMobile() ? PULSE.mobile : PULSE.desktop;
  const level = bands.bass * 0.65 + bands.mid * 0.35;
  const bar = barEnabled
    ? Math.min(1, level * env * (bp.intensity / 2.5) * bp.barGain)
    : 0;
  document.documentElement.style.setProperty("--pulse-bar", bar.toFixed(3));
  telemetry.bass = bands.bass * env;
  telemetry.mid = bands.mid * env;
  telemetry.high = bands.high * env;
  telemetry.pulseStrength = level * env;
  telemetry.sonicIntensity = bp.intensity;
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
  // Fade envelope toward the play state (shared by pulse + spectrum). "running"
  // requires a live source, so the analyser is only read while truly playing.
  const running = !!graph && graph.ctx.state === "running" && !!graph.source;
  if (graph) {
    telemetry.audioState = graph.ctx.state;
    telemetry.audioSourceCount = graph.source ? 1 : 0;
    telemetry.audioOffset = currentOffset();
  }
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
