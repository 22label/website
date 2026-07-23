import { test } from "node:test";
import assert from "node:assert/strict";
import { ScratchSamplePlayer } from "../public/worklets/scratchSamplePlayer.mjs";

// Build a player over a synthetic loop buffer. rampMs:0 → the click-safe envelope is
// instant, so output samples equal the buffer values (lets us assert exact DSP math).
function makePlayer(len, nc = 2, fill = (c, i) => c * 10 + i) {
  const chans = [];
  for (let c = 0; c < nc; c++) {
    const a = new Float32Array(len);
    for (let i = 0; i < len; i++) a[i] = fill(c, i);
    chans.push(a);
  }
  const p = new ScratchSamplePlayer({ sampleRate: 48000, rampMs: 0 });
  p.setBuffer(chans, len, nc, 48000);
  return { p, chans };
}
function outBuf(nc, frames) {
  const o = [];
  for (let c = 0; c < nc; c++) o.push(new Float32Array(frames));
  return o;
}
function peak(out) {
  let m = 0;
  for (const c of out) for (const v of c) m = Math.max(m, Math.abs(v));
  return m;
}

test("read head advances by rate 1", () => {
  const { p } = makePlayer(1000);
  p.setPlaying(true);
  p.process(outBuf(2, 128), 128);
  assert.equal(Math.round(p.getPosition()), 128);
});

test("authoritative position reporting reflects advancement", () => {
  const { p } = makePlayer(1000);
  p.setPlaying(true);
  p.process(outBuf(2, 128), 128);
  const p1 = p.getPosition();
  p.process(outBuf(2, 128), 128);
  assert.equal(Math.round(p.getPosition() - p1), 128);
});

test("modulo wrapping at the loop length", () => {
  const { p } = makePlayer(100);
  p.setPlaying(true);
  p.seek(90);
  p.process(outBuf(2, 20), 20); // 90 → 110 → wraps to 10
  assert.equal(Math.round(p.getPosition()), 10);
});

test("stereo channel output matches the buffer at integer positions", () => {
  const len = 64;
  const { p, chans } = makePlayer(len, 2); // ch0 = i, ch1 = 10 + i
  p.setPlaying(true);
  p.seek(0);
  const o = outBuf(2, 5);
  p.process(o, 5);
  for (let f = 0; f < 5; f++) {
    assert.ok(Math.abs(o[0][f] - chans[0][f]) < 1e-4);
    assert.ok(Math.abs(o[1][f] - chans[1][f]) < 1e-4);
  }
});

test("no output and no advance before playing (no phantom transport)", () => {
  const { p } = makePlayer(500);
  const o = outBuf(2, 128);
  p.process(o, 128);
  assert.ok(peak(o) < 1e-6, "silent before play");
  assert.equal(p.getPosition(), 0, "frozen before play");
});

test("hold freezes the position and outputs silence", () => {
  const { p } = makePlayer(500);
  p.setPlaying(true);
  p.process(outBuf(2, 137), 137);
  const held = p.getPosition();
  p.setPlaying(false);
  const o = outBuf(2, 256);
  p.process(o, 256);
  assert.equal(p.getPosition(), held, "position frozen while held");
  assert.ok(peak(o) < 1e-6, "silence while held");
});

test("resume continues from the exact held position", () => {
  const { p } = makePlayer(2000);
  p.setPlaying(true);
  p.process(outBuf(2, 300), 300);
  const held = p.getPosition();
  p.setPlaying(false);
  p.process(outBuf(2, 50), 50); // frozen
  assert.equal(p.getPosition(), held);
  p.setPlaying(true);
  p.process(outBuf(2, 100), 100); // resume
  assert.equal(Math.round(p.getPosition() - held), 100);
});

test("loop-seam read is continuous (baked crossfade honoured)", () => {
  // Periodic buffer: sample[i] = sin(2π i / len) → sample[len-1] → sample[0] continuous.
  const len = 256;
  const { p } = makePlayer(len, 1, (_c, i) => Math.sin((2 * Math.PI * i) / len));
  p.setPlaying(true);
  p.seek(len - 3);
  const o = outBuf(1, 6);
  p.process(o, 6); // crosses the seam (len-3 … 0 … 2)
  let maxJump = 0;
  for (let f = 1; f < 6; f++) maxJump = Math.max(maxJump, Math.abs(o[0][f] - o[0][f - 1]));
  // Per-sample slope of the sine near the seam; the crossing must not exceed it much.
  const localSlope = Math.abs(Math.sin((2 * Math.PI * 1) / len)) + 1e-3;
  assert.ok(maxJump < localSlope * 3, `seam jump ${maxJump} vs slope ${localSlope}`);
});

// ---------------------------------------------------------------- STAGE B (rate)
test("B1 forward fractional rate advances at that rate", () => {
  const { p } = makePlayer(1000);
  p.setPlaying(true);
  p.setRate(0.5);
  p.process(outBuf(2, 100), 100);
  assert.ok(Math.abs(p.getPosition() - 50) < 1e-6, `pos ${p.getPosition()}`);
});

test("B2 faster forward rate advances proportionally", () => {
  const { p } = makePlayer(10000);
  p.setPlaying(true);
  p.setRate(3);
  p.process(outBuf(2, 100), 100);
  assert.ok(Math.abs(p.getPosition() - 300) < 1e-6, `pos ${p.getPosition()}`);
});

test("B3 negative rate moves the read head backward", () => {
  const { p } = makePlayer(1000);
  p.setPlaying(true);
  p.seek(500);
  p.setRate(-1);
  p.process(outBuf(2, 100), 100);
  assert.ok(Math.abs(p.getPosition() - 400) < 1e-6, `pos ${p.getPosition()}`);
});

test("B4 reverse wraps modulo the loop length", () => {
  const { p } = makePlayer(100);
  p.setPlaying(true);
  p.seek(10);
  p.setRate(-1);
  p.process(outBuf(2, 20), 20); // 10 → -10 → wraps to 90
  assert.ok(Math.abs(p.getPosition() - 90) < 1e-6, `pos ${p.getPosition()}`);
});

test("B5 zero rate freezes position and outputs safe silence", () => {
  const { p } = makePlayer(500);
  p.setPlaying(true);
  p.setRate(1);
  p.process(outBuf(2, 50), 50);
  const held = p.getPosition();
  p.setRate(0);
  const o = outBuf(2, 200);
  p.process(o, 200);
  assert.equal(p.getPosition(), held, "position frozen at rate 0");
  assert.ok(peak(o) < 1e-6, "silent at rate 0 (rampMs 0 → instant motion gate)");
});

test("B6 direction reversal keeps the output continuous", () => {
  const len = 1000;
  const { p } = makePlayer(len, 1, (_c, i) => i / len); // smooth linear ramp
  p.setPlaying(true);
  p.seek(100);
  p.setRate(1);
  const o1 = outBuf(1, 10);
  p.process(o1, 10); // reads 100..109, head → 110
  p.setRate(-1);
  const o2 = outBuf(1, 10);
  p.process(o2, 10); // reads 110..101 backward
  const jump = Math.abs(o2[0][0] - o1[0][9]); // across the reversal
  assert.ok(jump < 2 / len + 1e-6, `reversal jump ${jump}`);
});

test("B7 stereo output correct at signed fractional rate", () => {
  const len = 200;
  const { p, chans } = makePlayer(len, 2, (c, i) => (c + 1) * (i / len));
  p.setPlaying(true);
  p.seek(50);
  p.setRate(-0.5);
  const o = outBuf(2, 4);
  p.process(o, 4);
  const positions = [50, 49.5, 49, 48.5]; // output happens before each advance
  for (let f = 0; f < 4; f++) {
    for (let c = 0; c < 2; c++) {
      const pos = positions[f];
      const i0 = Math.floor(pos);
      const i1 = (i0 + 1) % len;
      const frac = pos - i0;
      const expect = chans[c][i0] * (1 - frac) + chans[c][i1] * frac;
      assert.ok(Math.abs(o[c][f] - expect) < 1e-5, `ch${c} f${f}: ${o[c][f]} vs ${expect}`);
    }
  }
});

test("B8 invalid rates are sanitised (no NaN/Infinity, clamped)", () => {
  const { p } = makePlayer(1000);
  p.setPlaying(true);
  for (const bad of [NaN, Infinity, -Infinity, "x", undefined, null, {}]) {
    p.seek(100);
    p.setRate(bad);
    const o = outBuf(2, 32);
    p.process(o, 32);
    assert.ok(Number.isFinite(p.getPosition()), `pos finite after rate ${String(bad)}`);
    for (const c of o)
      for (const v of c)
        assert.ok(Number.isFinite(v), `sample finite after rate ${String(bad)}`);
  }
  p.setRate(1e9);
  assert.ok(Math.abs(p.rate) <= 32, `clamped rate ${p.rate}`);
  p.setRate(-1e9);
  assert.ok(Math.abs(p.rate) <= 32, `clamped rate ${p.rate}`);
});

test("B9 rate 1 parity: output equals the buffer (Stage A unchanged)", () => {
  const len = 128;
  const { p, chans } = makePlayer(len, 2);
  p.setPlaying(true);
  p.setRate(1);
  p.seek(0);
  const o = outBuf(2, 32);
  p.process(o, 32);
  for (let f = 0; f < 32; f++) {
    assert.ok(Math.abs(o[0][f] - chans[0][f]) < 1e-4);
    assert.ok(Math.abs(o[1][f] - chans[1][f]) < 1e-4);
  }
});
