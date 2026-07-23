import { test } from "node:test";
import assert from "node:assert/strict";
import { createScratchDrag } from "../src/effects/marqueeScratchDrag.mjs";
import {
  advanceMarqueePhase,
  setMarqueeScratch,
  marqueeScratchActive,
  marqueeScratchRate,
} from "../src/effects/scratchBridge.mjs";

const DT = 16;
const CYCLE = 33000;
const idleStep = (1 * DT) / CYCLE; // idle phase increment per frame (rate 1)

// Replicate the component wiring (no React/DOM): the SAME signed rate drives audio +
// the bridge; end() hands the marquee back to idle. `reset()` clears the singleton.
function wireSession() {
  const rates = [];
  const drag = createScratchDrag({
    onRate: (r) => {
      rates.push(r);
      setMarqueeScratch(true, r);
    },
  });
  const end = () => {
    drag.end();
    setMarqueeScratch(false, 1);
  };
  return { drag, end, rates };
}
function reset() {
  setMarqueeScratch(false, 1);
}

test("1 forward drag → marquee moves forward (idle direction)", () => {
  reset();
  const before = 0.5;
  assert.ok(advanceMarqueePhase(before, 3, DT, CYCLE) > before);
});

test("2 reverse drag → marquee moves backward", () => {
  reset();
  const before = 0.5;
  assert.ok(advanceMarqueePhase(before, -3, DT, CYCLE) < before);
});

test("3 held still while engaged → marquee does not move", () => {
  reset();
  assert.equal(advanceMarqueePhase(0.5, 0, DT, CYCLE), 0.5);
});

test("4 faster drag → proportionally faster marquee movement", () => {
  reset();
  const d1 = advanceMarqueePhase(0, 1, DT, CYCLE);
  const d4 = advanceMarqueePhase(0, 4, DT, CYCLE);
  assert.ok(Math.abs(d4 - 4 * d1) < 1e-12);
});

test("5 direction reversal within a sequence stays continuous", () => {
  reset();
  const p1 = advanceMarqueePhase(0.5, 4, DT, CYCLE); // forward
  const p2 = advanceMarqueePhase(p1, -4, DT, CYCLE); // equal reverse
  assert.ok(Math.abs(p2 - 0.5) < 1e-9);
});

test("reverse wraps seamlessly through 0 (no jump)", () => {
  reset();
  const wrapped = advanceMarqueePhase(0.001, -10, DT, CYCLE); // pushed below 0
  assert.ok(wrapped >= 0 && wrapped < 1, "stays in [0,1)");
  assert.ok(wrapped > 0.9, "wrapped to near 1");
});

test("6 click below threshold → bridge never activates (no visual change)", () => {
  reset();
  const { drag, end, rates } = wireSession();
  drag.down(100);
  drag.move(103); // < engage threshold
  drag.frame();
  drag.move(104);
  drag.frame();
  end();
  assert.equal(rates.length, 0, "no scratch emitted");
  assert.equal(marqueeScratchActive(), false, "marquee stays on idle");
});

test("7 release returns to idle without reset or jump", () => {
  reset();
  const { drag, end } = wireSession();
  drag.down(100);
  drag.move(160);
  drag.frame(); // engaged, forward (rate clamped to 8)
  assert.equal(marqueeScratchActive(), true);
  const phase = advanceMarqueePhase(0.5, marqueeScratchRate(), DT, CYCLE);
  end();
  assert.equal(marqueeScratchActive(), false, "handed back to idle");
  assert.equal(marqueeScratchRate(), 1, "idle rate");
  // the next idle frame continues from the SAME phase (no reset / snap)
  const idleNext = advanceMarqueePhase(phase, 1, DT, CYCLE);
  assert.ok(Math.abs(idleNext - phase - idleStep) < 1e-12);
});

test("8 repeated scratch sessions preserve marquee continuity", () => {
  reset();
  let phase = 0.42;
  for (let s = 0; s < 3; s++) {
    const { drag, end } = wireSession();
    drag.down(100);
    drag.move(100 + 40 * (s % 2 === 0 ? 1 : -1)); // alternate direction
    drag.frame();
    phase = advanceMarqueePhase(phase, marqueeScratchRate(), DT, CYCLE);
    const beforeRelease = phase;
    end();
    phase = advanceMarqueePhase(phase, 1, DT, CYCLE); // idle continues from here
    assert.ok(
      Math.abs(phase - beforeRelease - idleStep) < 1e-9,
      "idle continues from the exact scratch position — never reset to 0",
    );
  }
});
