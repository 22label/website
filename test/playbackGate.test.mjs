import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shouldSound,
  suppress,
  unsuppress,
} from "../src/effects/playbackGate.mjs";

// Mirror audioReactive's module state as a plain object the setter mutates.
const playing = () => ({ wantPlay: true, autoplayOnce: false, suppressed: false });
const freshLoad = () => ({ wantPlay: false, autoplayOnce: true, suppressed: false });

test("shouldSound: only when wanted AND not suppressed", () => {
  assert.equal(shouldSound({ wantPlay: true, suppressed: false }), true);
  assert.equal(shouldSound({ wantPlay: false, suppressed: false }), false);
  assert.equal(shouldSound({ wantPlay: true, suppressed: true }), false);
  assert.equal(shouldSound({ wantPlay: false, suppressed: true }), false);
});

test("ENTER while music is playing → route is silenced (both LIVE transports)", () => {
  const s = suppress(playing());
  assert.equal(s.suppressed, true);
  assert.equal(s.wantPlay, false);
  assert.equal(shouldSound(s), false); // reconcile() → worklet/source stop
});

test("LEAVE does NOT auto-resume — the core regression this guards", () => {
  const left = unsuppress(suppress(playing()));
  assert.equal(left.suppressed, false);
  assert.equal(left.wantPlay, false); // desired state forced to paused
  assert.equal(shouldSound(left), false); // reconcile() keeps it stopped
});

test("play requested WHILE suppressed → leaving still remains silent", () => {
  let s = suppress(playing()); // on /capsule, silent
  s = { ...s, wantPlay: true }; // a stray play request flips wantPlay true
  assert.equal(shouldSound(s), false); // still silent — suppressed wins
  const left = unsuppress(s); // leave the route
  assert.equal(left.wantPlay, false); // hardened: forced back to paused
  assert.equal(shouldSound(left), false); // remains silent, no auto-resume
});

test("ENTER cancels the one-shot autoplay (fresh load landing on /capsule)", () => {
  const s = suppress(freshLoad());
  assert.equal(s.autoplayOnce, false);
  assert.equal(shouldSound(s), false);
});

test("after leaving, an explicit user play still resumes (control works)", () => {
  const left = unsuppress(suppress(playing()));
  const afterUserPlay = { ...left, wantPlay: true }; // togglePlayback()
  assert.equal(shouldSound(afterUserPlay), true);
});

test("idempotent: re-entering / re-leaving is stable", () => {
  const a = suppress(suppress(playing()));
  assert.deepEqual(a, { wantPlay: false, autoplayOnce: false, suppressed: true });
  const b = unsuppress(unsuppress(a));
  assert.equal(b.suppressed, false);
  assert.equal(b.wantPlay, false);
  assert.equal(shouldSound(b), false);
});
