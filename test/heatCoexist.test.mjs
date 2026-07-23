import { test } from "node:test";
import assert from "node:assert/strict";
import { heatTarget } from "../src/effects/heatTarget.mjs";

// heatTarget(enabled, suppressed, running, rawHeat) — the Stage D coexistence policy.

test("beginning a scratch suppresses Heat to dry (regardless of scroll heat)", () => {
  assert.equal(heatTarget(true, true, true, 0.8), 0);
  assert.equal(heatTarget(true, true, true, 1), 0);
});

test("ending a scratch restores the current scroll-derived Heat", () => {
  // Same scroll heat before and after a suppression cycle → nothing lost.
  const rawHeat = 0.8;
  assert.equal(heatTarget(true, false, true, rawHeat), rawHeat); // not suppressed
  assert.equal(heatTarget(true, true, true, rawHeat), 0); // suppressed → dry
  assert.equal(heatTarget(true, false, true, rawHeat), rawHeat); // restored exactly
});

test("scratch suppression does not alter the scroll heat source (independence)", () => {
  // Across many scroll levels, suppressed is always dry and unsuppressed passes the
  // exact scroll value through — the policy ducks output only, never the source.
  for (const raw of [0, 0.15, 0.4, 0.73, 1]) {
    assert.equal(heatTarget(true, true, true, raw), 0);
    assert.equal(heatTarget(true, false, true, raw), raw);
  }
});

test("Heat is dry when not Home-enabled", () => {
  assert.equal(heatTarget(false, false, true, 0.9), 0);
});

test("Heat is dry when music is not running (paused)", () => {
  assert.equal(heatTarget(true, false, false, 0.9), 0);
});

test("scroll heat is clamped to 0..1", () => {
  assert.equal(heatTarget(true, false, true, 1.5), 1);
  assert.equal(heatTarget(true, false, true, -0.3), 0);
});

test("dry at rest (heat 0) is exactly 0", () => {
  assert.equal(heatTarget(true, false, true, 0), 0);
});
