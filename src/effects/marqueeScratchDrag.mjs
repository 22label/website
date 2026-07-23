/**
 * Pure, DOM-free drag → signed-rate state machine for the desktop marquee scratch
 * (Stage C). The component feeds it pointer x-positions + per-frame ticks; it calls
 * `onRate` with the signed scratch rate for the AudioWorklet transport (Stage B):
 *   drag right → +rate (forward), drag left → −rate (reverse),
 *   held still (no per-frame movement) → 0, release → 1 (normal forward playback).
 *
 * A small engage threshold means a plain click (no real horizontal movement) never
 * touches the rate — so navigation/click behaviour is unaffected. Kept pure so the
 * whole interaction (direction, speed, zero-hold, release recovery) is unit-tested.
 *
 * @typedef {Object} ScratchDragOptions
 * @property {number} [engagePx]  Min horizontal travel before a scratch engages (px).
 * @property {number} [ratePerPx] Per-frame pixel delta → rate scale.
 * @property {number} [rateMax]   Musical clamp (the worklet also hard-clamps ±32).
 * @property {(rate:number)=>void} onRate
 *
 * @typedef {Object} ScratchDrag
 * @property {(x:number)=>void} down
 * @property {(x:number)=>void} move
 * @property {()=>void} frame
 * @property {()=>void} end
 * @property {()=>boolean} isActive
 */

/**
 * @param {ScratchDragOptions} opts
 * @returns {ScratchDrag}
 */
export function createScratchDrag(opts) {
  const engagePx = opts.engagePx == null ? 6 : opts.engagePx;
  const ratePerPx = opts.ratePerPx == null ? 0.15 : opts.ratePerPx;
  const rateMax = opts.rateMax == null ? 8 : opts.rateMax;
  const onRate = opts.onRate;

  let active = false;
  let engaged = false;
  let startX = 0;
  let lastX = 0;
  let curX = 0;

  return {
    down(x) {
      active = true;
      engaged = false;
      startX = lastX = curX = x;
    },
    move(x) {
      if (active) curX = x;
    },
    frame() {
      if (!active) return;
      if (!engaged && Math.abs(curX - startX) > engagePx) engaged = true;
      if (engaged) {
        let rate = (curX - lastX) * ratePerPx;
        if (rate > rateMax) rate = rateMax;
        else if (rate < -rateMax) rate = -rateMax;
        onRate(rate); // held still (curX === lastX) → 0
      }
      lastX = curX;
    },
    end() {
      if (!active) return;
      active = false;
      if (engaged) onRate(1); // restore normal forward playback cleanly
      engaged = false;
    },
    isActive() {
      return active;
    },
  };
}
