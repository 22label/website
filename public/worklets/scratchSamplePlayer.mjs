/**
 * Pure, framework-free sample-player DSP for the desktop Scratch transport (Stage A).
 *
 * The AudioWorklet (scratch-processor.js) and the focused Node tests BOTH use this
 * module, so the tested logic is exactly the shipped logic — no duplication, no
 * AudioWorklet globals in here.
 *
 * A fractional read head advances by `rate` samples per output frame (rate = 1 is
 * normal playback; negative/other rates are reserved for Stage B and untouched here)
 * and wraps modulo the loop length with linear interpolation across the seam. The
 * loop buffer is baked seamless upstream (equal-power tail→head crossfade), so the
 * wrapped read is continuous — the crossfade lives in the sample data and the read
 * head simply honours it. A short click-safe amplitude envelope ramps on play/hold,
 * so pausing FREEZES the read head and resuming continues from the exact position:
 * the read head is the single authoritative transport clock.
 */
export class ScratchSamplePlayer {
  constructor(options = {}) {
    this.channels = null; // Float32Array[] — one per channel
    this.length = 0; // loop length in samples
    this.numChannels = 0;
    this.sampleRate = options.sampleRate || 48000;
    this.rampMs = options.rampMs == null ? 5 : options.rampMs; // click-safe fade
    this.pos = 0; // fractional read head (samples) — AUTHORITATIVE position
    this.rate = 1; // Stage A: always 1 (variable/negative rate = Stage B)
    this.playing = false;
    this.env = 0; // 0..1 amplitude envelope (click-safety)
    this._recomputeStep();
  }

  _recomputeStep() {
    const rs = (this.rampMs / 1000) * this.sampleRate;
    this.envStep = rs > 0 ? 1 / rs : 1; // per-frame env delta (1 → instant)
  }

  setBuffer(channels, length, numChannels, sampleRate) {
    this.channels = channels;
    this.length = length | 0;
    this.numChannels = numChannels | 0;
    if (sampleRate) {
      this.sampleRate = sampleRate;
      this._recomputeStep();
    }
    this.pos = this._wrap(this.pos);
  }

  setRate(r) {
    this.rate = r; // reserved for Stage B
  }
  setPlaying(on) {
    this.playing = !!on;
  }
  seek(posSamples) {
    this.pos = this._wrap(posSamples);
  }
  getPosition() {
    return this.pos; // authoritative transport position (samples)
  }

  _wrap(p) {
    const n = this.length;
    if (n <= 0) return 0;
    let x = p % n;
    if (x < 0) x += n;
    return x;
  }

  _sampleAt(ch, pos) {
    const data = this.channels[ch];
    const n = this.length;
    const base = Math.floor(pos);
    const i0 = base % n;
    const i1 = (base + 1) % n; // wraps → the baked loop seam stays continuous
    const frac = pos - base;
    return data[i0] * (1 - frac) + data[i1] * frac;
  }

  /**
   * Fill `frames` frames into out[ch] (a Float32Array per channel). Advances the read
   * head at `rate` while audible (playing, or fading out) and freezes it once fully
   * held — so a resume continues from the exact frozen position.
   */
  process(out, frames) {
    const nc = this.numChannels;
    if (!this.channels || this.length <= 0 || nc === 0) {
      for (let c = 0; c < out.length; c++) out[c].fill(0, 0, frames);
      return;
    }
    for (let f = 0; f < frames; f++) {
      const target = this.playing ? 1 : 0;
      if (this.env < target) this.env = Math.min(target, this.env + this.envStep);
      else if (this.env > target)
        this.env = Math.max(target, this.env - this.envStep);
      const e = this.env;
      for (let c = 0; c < out.length; c++) {
        out[c][f] = c < nc ? this._sampleAt(c, this.pos) * e : 0;
      }
      // Advance only while audible; when fully held (paused) the position freezes.
      if (this.playing || this.env > 0) this.pos = this._wrap(this.pos + this.rate);
    }
  }
}
