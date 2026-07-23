/**
 * Pure, framework-free sample-player DSP for the desktop Scratch transport (Stage A).
 *
 * The AudioWorklet (scratch-processor.js) and the focused Node tests BOTH use this
 * module, so the tested logic is exactly the shipped logic — no duplication, no
 * AudioWorklet globals in here.
 *
 * A fractional read head advances by a SIGNED `rate` samples per output frame
 * (rate 1 = normal forward playback, <0 = reverse, 0 = stationary, fractional =
 * pitch/speed change) and wraps modulo the loop length — forwards AND backwards —
 * with linear interpolation across the seam. The loop buffer is baked seamless
 * upstream (equal-power tail→head crossfade), so the wrapped read is continuous in
 * both directions — the crossfade lives in the sample data and the read head simply
 * honours it. The read head is the single authoritative transport clock.
 *
 * Two independent click-safe amplitude envelopes:
 *   • `env`    — play/hold. Pausing (playing=false) freezes the head and ramps to
 *                silence; resuming continues from the exact frozen position.
 *   • `motion` — rate-0 gate. When |rate| ≈ 0 the head is stationary and the output
 *                ramps to silence (a stopped record is silent), separately from hold.
 * At rate 1 `motion` is always 1, so Stage A behaviour is unchanged. Direction
 * reversal is click-free because the read position is continuous (only its sign of
 * motion flips). Invalid rates are sanitised so no NaN/Infinity can enter the graph.
 */
export class ScratchSamplePlayer {
  constructor(options = {}) {
    this.channels = null; // Float32Array[] — one per channel
    this.length = 0; // loop length in samples
    this.numChannels = 0;
    this.sampleRate = options.sampleRate || 48000;
    this.rampMs = options.rampMs == null ? 5 : options.rampMs; // click-safe fade
    this.pos = 0; // fractional read head (samples) — AUTHORITATIVE position
    this.rate = 1; // signed playback rate (Stage B): >0 fwd, <0 rev, 0 stationary
    this.playing = false;
    this.env = 0; // 0..1 play/hold amplitude envelope (click-safety)
    this.motion = 1; // 0..1 rate-0 gate (1 while moving; ramps to 0 when |rate|≈0)
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
    // Sanitise: reject NaN/Infinity/non-numbers, clamp to a sane magnitude so no
    // invalid or runaway rate can ever reach the read head / output.
    let v = typeof r === "number" && Number.isFinite(r) ? r : 0;
    const MAX = 32;
    if (v > MAX) v = MAX;
    else if (v < -MAX) v = -MAX;
    this.rate = v;
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
   * Fill `frames` frames into out[ch] (a Float32Array per channel). The read head
   * advances by the SIGNED `rate` while audible; hold (env→0) or rate 0 (motion→0)
   * both ramp to silence and freeze the head, so a resume/re-move continues from the
   * exact frozen position. Output = interpolated sample × env × motion.
   */
  process(out, frames) {
    const nc = this.numChannels;
    if (!this.channels || this.length <= 0 || nc === 0) {
      for (let c = 0; c < out.length; c++) out[c].fill(0, 0, frames);
      return;
    }
    const EPS = 1e-4; // |rate| below this counts as stationary (rate-0 gate)
    for (let f = 0; f < frames; f++) {
      // play/hold envelope
      const envTarget = this.playing ? 1 : 0;
      if (this.env < envTarget)
        this.env = Math.min(envTarget, this.env + this.envStep);
      else if (this.env > envTarget)
        this.env = Math.max(envTarget, this.env - this.envStep);
      // rate-0 motion gate (independent of hold)
      const moveTarget = Math.abs(this.rate) > EPS ? 1 : 0;
      if (this.motion < moveTarget)
        this.motion = Math.min(moveTarget, this.motion + this.envStep);
      else if (this.motion > moveTarget)
        this.motion = Math.max(moveTarget, this.motion - this.envStep);
      const a = this.env * this.motion;
      for (let c = 0; c < out.length; c++) {
        out[c][f] = c < nc ? this._sampleAt(c, this.pos) * a : 0;
      }
      // Advance by the signed rate while audible; frozen when fully held (env 0).
      // At rate 0 this is a no-op, so the head is stationary but never lost.
      if (this.playing || this.env > 0) this.pos = this._wrap(this.pos + this.rate);
    }
  }
}
