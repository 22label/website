import { test } from "node:test";
import assert from "node:assert/strict";
import { createScratchDrag } from "../src/effects/marqueeScratchDrag.mjs";

// Records every onRate() call so the interaction can be asserted deterministically.
function makeDrag(over = {}) {
  const rates = [];
  const d = createScratchDrag({ onRate: (r) => rates.push(r), ...over });
  return { d, rates };
}

test("forward drag (right) → positive rate proportional to speed", () => {
  const { d, rates } = makeDrag();
  d.down(100);
  d.move(120);
  d.frame(); // dx = +20 → 20 * 0.15 = 3
  assert.ok(rates.at(-1) > 0, "forward is positive");
  assert.ok(Math.abs(rates.at(-1) - 3) < 1e-9);
});

test("reverse drag (left) → negative rate", () => {
  const { d, rates } = makeDrag();
  d.down(100);
  d.move(80);
  d.frame(); // dx = -20 → -3
  assert.ok(rates.at(-1) < 0, "reverse is negative");
  assert.ok(Math.abs(rates.at(-1) + 3) < 1e-9);
});

test("faster drag → larger magnitude", () => {
  const { d, rates } = makeDrag();
  d.down(100);
  d.move(110);
  d.frame(); // +10 → 1.5
  const slow = rates.at(-1);
  d.move(150);
  d.frame(); // +40 → 6
  const fast = rates.at(-1);
  assert.ok(fast > slow && slow > 0);
});

test("held still while engaged → rate 0", () => {
  const { d, rates } = makeDrag();
  d.down(100);
  d.move(130);
  d.frame(); // engaged, +rate
  assert.ok(rates.at(-1) > 0);
  d.frame(); // no move → dx 0 → rate 0
  assert.equal(rates.at(-1), 0);
});

test("engage threshold: tiny movement never scratches", () => {
  const { d, rates } = makeDrag();
  d.down(100);
  d.move(103); // < 6px
  d.frame();
  d.move(104);
  d.frame();
  assert.equal(rates.length, 0, "no rate change below the engage threshold");
});

test("plain click (no engage) does not touch the rate on release", () => {
  const { d, rates } = makeDrag();
  d.down(100);
  d.move(102);
  d.frame();
  d.end(); // never engaged → must NOT emit rate 1
  assert.equal(rates.length, 0);
});

test("release after a real scratch restores forward playback (rate 1)", () => {
  const { d, rates } = makeDrag();
  d.down(100);
  d.move(140);
  d.frame(); // engaged
  d.move(120);
  d.frame(); // reverse
  d.end();
  assert.equal(rates.at(-1), 1, "release recovers to normal forward");
});

test("rate is clamped to the musical maximum", () => {
  const { d, rates } = makeDrag({ rateMax: 8 });
  d.down(100);
  d.move(400); // dx 300 → 45 → clamp 8
  d.frame();
  assert.equal(rates.at(-1), 8);
  d.move(-400); // huge reverse → clamp -8
  d.frame();
  assert.equal(rates.at(-1), -8);
});

test("direction reversal within one drag follows the gesture", () => {
  const { d, rates } = makeDrag();
  d.down(100);
  d.move(140);
  d.frame(); // +
  d.move(100);
  d.frame(); // -
  d.move(140);
  d.frame(); // +
  assert.ok(rates[0] > 0 && rates[1] < 0 && rates[2] > 0);
});
