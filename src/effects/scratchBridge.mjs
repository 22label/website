/**
 * Shared bridge between the desktop marquee-scratch gesture (MarqueeScratch + the
 * pure marqueeScratchDrag driver) and the WebGL Monogram loop that owns the visual
 * marquee offset. This is NOT a second gesture state machine — just the current
 * visual scratch signal: the gesture pushes it, the loop pulls it once per frame.
 * When inactive the loop uses its normal idle scroll (rate 1), so the marquee's idle
 * appearance/speed stays byte-identical to before this feature.
 */

let sActive = false;
let sRate = 1; // signed visual rate (× idle velocity); 1 = normal idle

/**
 * Gesture → bridge. `active` is true while a scratch is engaged; `rate` is the SAME
 * signed rate that drives the audio (drag right > 0, left < 0, held still 0). On
 * release the caller passes (false, 1) to hand the marquee back to its idle scroll.
 * @param {boolean} active
 * @param {number} rate
 */
export function setMarqueeScratch(active, rate) {
  sActive = !!active;
  sRate = Number.isFinite(rate) ? rate : 1;
}

/** @returns {boolean} whether a scratch is currently driving the marquee. */
export function marqueeScratchActive() {
  return sActive;
}

/** @returns {number} the current signed visual rate (× idle velocity; 1 = idle). */
export function marqueeScratchRate() {
  return sRate;
}

/**
 * Advance the marquee scroll phase by one frame. `rate` 1 = normal idle; a scratch
 * passes its signed rate so the marquee moves the SAME direction + proportional speed
 * as the audio. Wraps seamlessly forwards AND backwards; it NEVER resets, so the phase
 * (and therefore the on-screen position) stays continuous across engage and release.
 * @param {number} frac current phase 0..1
 * @param {number} rate signed rate (1 = idle)
 * @param {number} dtMs frame delta (ms)
 * @param {number} cycleMs idle cycle length (ms)
 * @returns {number} next phase 0..1
 */
export function advanceMarqueePhase(frac, rate, dtMs, cycleMs) {
  let f = frac + (rate * dtMs) / cycleMs;
  f = ((f % 1) + 1) % 1;
  return f;
}
