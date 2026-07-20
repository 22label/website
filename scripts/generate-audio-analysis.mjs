/**
 * Offline spectral analysis for the mobile audio-reactive pipeline.
 * -----------------------------------------------------------------
 * WHY: On iOS, Web Audio output is gated by the mute switch, so mobile playback
 * must use a plain HTMLAudioElement (media channel — audible even when muted).
 * But that element cannot be routed through an AnalyserNode without pulling the
 * sound back onto the (muteable) Web Audio session. So instead of analysing live
 * on mobile, we analyse the track ONCE, offline, here, and ship a compact asset
 * the runtime samples by `audioElement.currentTime`.
 *
 * PIPELINE (fully reproducible, no third-party deps):
 *   1. Decode the MP3 to mono 16-bit PCM WAV with macOS `afconvert` (CoreAudio,
 *      preinstalled on every Mac — no ffmpeg/brew needed).
 *   2. STFT: Hann-windowed radix-2 FFT (size 2048), hop = sampleRate / FPS.
 *   3. Per frame: 40 log-spaced bands (20 Hz–16 kHz) + bass/mid/high + RMS + peak.
 *      Magnitudes are converted to dB and mapped like the browser's
 *      getByteFrequencyData (minDb..maxDb -> 0..1) so the offline field matches
 *      the live desktop AnalyserNode look. Bands keep the real spectral balance
 *      (ONE global dB window); bass/mid/high are each lifted to their own peak so
 *      the Sonic Pulse stays lively.
 *   4. Quantise to Uint8 and write a flat binary + a small JSON metadata file.
 *
 * OUTPUT:
 *   /public/audio/intruder-spectrum.bin        (frames x FRAME_STRIDE bytes)
 *   /public/audio/intruder-spectrum-meta.json  (fps, bands, layout, ...)
 *
 * RUN:  node scripts/generate-audio-analysis.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const INPUT = join(ROOT, "public/audio/intruder-snippet.mp3");
const OUT_BIN = join(ROOT, "public/audio/intruder-spectrum.bin");
const OUT_META = join(ROOT, "public/audio/intruder-spectrum-meta.json");

// ----------------------------------------------------------------- parameters
const ANALYSIS_FPS = 30; // visual sample rate (~30 samples/sec)
const FFT_SIZE = 2048; // radix-2 window
const BAND_COUNT = 40; // log bands, matches HEATMAP.numBands
const F_LO = 20; // lowest analysed frequency (Hz)
const F_HI = 16000; // highest analysed frequency (Hz)
// dB window used to map magnitude -> 0..1 (mirrors the browser analyser defaults,
// widened a touch at the floor so quiet treble still shows in the field).
const MIN_DB = -100;
const MAX_DB = -18;
// bass/mid/high frequency ranges (Hz)
const BASS = [20, 200];
const MID = [200, 2000];
const HIGH = [2000, 12000];

// Per-frame byte layout: [band0..band39][bass][mid][high][rms][peak]
const FRAME_STRIDE = BAND_COUNT + 5;
const OFF_BASS = BAND_COUNT;
const OFF_MID = BAND_COUNT + 1;
const OFF_HIGH = BAND_COUNT + 2;
const OFF_RMS = BAND_COUNT + 3;
const OFF_PEAK = BAND_COUNT + 4;

// --------------------------------------------------------------- decode (WAV)
function decodeToWav() {
  const dir = mkdtempSync(join(tmpdir(), "spectrum-"));
  const wav = join(dir, "audio.wav");
  // -f WAVE -d LEI16  : 16-bit little-endian PCM WAV
  // -c 1              : downmix to mono
  execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16", "-c", "1", INPUT, wav], {
    stdio: "pipe",
  });
  const buf = readFileSync(wav);
  rmSync(dir, { recursive: true, force: true });
  return parseWav(buf);
}

/** Minimal WAV parser: returns { samples: Float32Array (-1..1), sampleRate }. */
function parseWav(buf) {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE")
    throw new Error("afconvert did not produce a RIFF/WAVE file");
  let pos = 12;
  let fmt = null;
  let dataOffset = -1;
  let dataLength = 0;
  while (pos + 8 <= buf.length) {
    const id = buf.toString("ascii", pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === "fmt ") {
      fmt = {
        audioFormat: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bitsPerSample: buf.readUInt16LE(body + 14),
      };
    } else if (id === "data") {
      dataOffset = body;
      dataLength = size;
    }
    pos = body + size + (size & 1); // chunks are word-aligned
  }
  if (!fmt || dataOffset < 0) throw new Error("WAV missing fmt/data chunk");
  if (fmt.bitsPerSample !== 16) throw new Error(`expected 16-bit PCM, got ${fmt.bitsPerSample}`);
  const ch = fmt.channels;
  const frames = Math.floor(dataLength / (2 * ch));
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let s = 0;
    for (let c = 0; c < ch; c++) s += buf.readInt16LE(dataOffset + (i * ch + c) * 2);
    out[i] = s / ch / 32768; // downmix + normalise to -1..1
  }
  return { samples: out, sampleRate: fmt.sampleRate };
}

// ---------------------------------------------------------------- radix-2 FFT
// In-place iterative Cooley-Tukey. re/im are Float64Array(FFT_SIZE).
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len >> 1; k++) {
        const a = i + k;
        const b = a + (len >> 1);
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

// --------------------------------------------------------------------- helpers
const hzToBin = (hz, sr) => (hz * FFT_SIZE) / sr;
const toDbNorm = (mag) => {
  const db = 20 * Math.log10(mag + 1e-9);
  return Math.min(1, Math.max(0, (db - MIN_DB) / (MAX_DB - MIN_DB)));
};

function main() {
  console.log(`Decoding ${INPUT} via afconvert ...`);
  const { samples, sampleRate } = decodeToWav();
  const duration = samples.length / sampleRate;
  console.log(`  ${samples.length} samples @ ${sampleRate} Hz = ${duration.toFixed(3)}s`);

  const hop = sampleRate / ANALYSIS_FPS;
  const frames = Math.max(1, Math.round(duration * ANALYSIS_FPS));
  const half = FFT_SIZE >> 1;

  // Hann window with coherent-gain correction (so magnitudes are amplitude-true).
  const win = new Float64Array(FFT_SIZE);
  let winSum = 0;
  for (let i = 0; i < FFT_SIZE; i++) {
    win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1));
    winSum += win[i];
  }
  const winGain = 2 / winSum; // amplitude normalisation

  // Precompute log band -> [binStart, binEnd) once.
  const bandBins = [];
  for (let i = 0; i < BAND_COUNT; i++) {
    const f0 = F_LO * Math.pow(F_HI / F_LO, i / BAND_COUNT);
    const f1 = F_LO * Math.pow(F_HI / F_LO, (i + 1) / BAND_COUNT);
    const b0 = Math.max(1, Math.floor(hzToBin(f0, sampleRate)));
    const b1 = Math.min(half, Math.max(b0 + 1, Math.ceil(hzToBin(f1, sampleRate))));
    bandBins.push([b0, b1]);
  }
  const rangeBins = (r) => [
    Math.max(1, Math.floor(hzToBin(r[0], sampleRate))),
    Math.min(half, Math.ceil(hzToBin(r[1], sampleRate))),
  ];
  const bassBins = rangeBins(BASS);
  const midBins = rangeBins(MID);
  const highBins = rangeBins(HIGH);

  // First pass: raw (dB-normalised) values so we can find global peaks.
  const bandsF = new Float32Array(frames * BAND_COUNT);
  const bassF = new Float32Array(frames);
  const midF = new Float32Array(frames);
  const highF = new Float32Array(frames);
  const rmsF = new Float32Array(frames);
  const peakF = new Float32Array(frames);

  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  const mag = new Float64Array(half);

  const bandDbAvg = (bins) => {
    let s = 0;
    for (let b = bins[0]; b < bins[1]; b++) s += toDbNorm(mag[b]);
    return s / (bins[1] - bins[0]);
  };

  for (let f = 0; f < frames; f++) {
    const start = Math.round(f * hop);
    // window the frame (zero-pad past the end of the track)
    let sumSq = 0;
    for (let i = 0; i < FFT_SIZE; i++) {
      const s = start + i < samples.length ? samples[start + i] : 0;
      re[i] = s * win[i];
      im[i] = 0;
      sumSq += s * s;
    }
    fft(re, im);
    for (let b = 0; b < half; b++) mag[b] = Math.hypot(re[b], im[b]) * winGain;

    for (let i = 0; i < BAND_COUNT; i++) bandsF[f * BAND_COUNT + i] = bandDbAvg(bandBins[i]);
    bassF[f] = bandDbAvg(bassBins);
    midF[f] = bandDbAvg(midBins);
    highF[f] = bandDbAvg(highBins);
    rmsF[f] = Math.sqrt(sumSq / FFT_SIZE);
    let pk = 0;
    for (let b = 1; b < half; b++) if (mag[b] > pk) pk = mag[b];
    peakF[f] = toDbNorm(pk);
  }

  // Global normalisation. Bands share ONE factor (preserve spectral balance);
  // bass/mid/high/rms each lifted to their own peak (lively Sonic Pulse).
  const gmax = (arr) => {
    let m = 1e-6;
    for (let i = 0; i < arr.length; i++) if (arr[i] > m) m = arr[i];
    return m;
  };
  const bandsMax = gmax(bandsF);
  const bassMax = gmax(bassF);
  const midMax = gmax(midF);
  const highMax = gmax(highF);
  const rmsMax = gmax(rmsF);

  const out = Buffer.alloc(frames * FRAME_STRIDE);
  const q = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  for (let f = 0; f < frames; f++) {
    const base = f * FRAME_STRIDE;
    for (let i = 0; i < BAND_COUNT; i++) out[base + i] = q(bandsF[f * BAND_COUNT + i] / bandsMax);
    out[base + OFF_BASS] = q(bassF[f] / bassMax);
    out[base + OFF_MID] = q(midF[f] / midMax);
    out[base + OFF_HIGH] = q(highF[f] / highMax);
    out[base + OFF_RMS] = q(rmsF[f] / rmsMax);
    out[base + OFF_PEAK] = q(peakF[f]);
  }

  writeFileSync(OUT_BIN, out);
  const meta = {
    version: 1,
    source: "public/audio/intruder-snippet.mp3",
    analysisFps: ANALYSIS_FPS,
    bandCount: BAND_COUNT,
    frameStride: FRAME_STRIDE,
    frames,
    durationSec: Number(duration.toFixed(4)),
    sampleRate,
    fftSize: FFT_SIZE,
    freqRangeHz: [F_LO, F_HI],
    bassRangeHz: BASS,
    midRangeHz: MID,
    highRangeHz: HIGH,
    mapping: "logarithmic",
    normalization: {
      bands: "single global dB-window peak (spectral balance preserved)",
      bassMidHigh: "per-channel global peak",
      dbWindow: [MIN_DB, MAX_DB],
    },
    layout: {
      bands: [0, BAND_COUNT],
      bass: OFF_BASS,
      mid: OFF_MID,
      high: OFF_HIGH,
      rms: OFF_RMS,
      peak: OFF_PEAK,
    },
    bytes: out.length,
  };
  writeFileSync(OUT_META, JSON.stringify(meta, null, 2));

  // ------------------------------------------------------------------- report
  const kb = (n) => (n / 1024).toFixed(1);
  console.log(`\nWrote ${OUT_BIN}`);
  console.log(`  ${frames} frames x ${FRAME_STRIDE} bytes = ${kb(out.length)} KB`);
  console.log(`Wrote ${OUT_META}`);
  console.log(`\n  fps=${ANALYSIS_FPS}  bands=${BAND_COUNT}  duration=${duration.toFixed(2)}s`);
  // quick sanity stats
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  console.log(
    `  band peak(raw)=${bandsMax.toFixed(3)}  ` +
      `bass µ=${(avg(bassF) / bassMax).toFixed(2)}  ` +
      `mid µ=${(avg(midF) / midMax).toFixed(2)}  ` +
      `high µ=${(avg(highF) / highMax).toFixed(2)}`,
  );
}

main();
