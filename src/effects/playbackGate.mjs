/**
 * Pure state machine for route-level playback suppression (the music-free
 * /capsule hub). Kept as a standalone .mjs policy module — like heatTarget.mjs —
 * so the enter/leave contract is unit-testable without a browser AudioContext,
 * while audioReactive.ts holds only the Web-Audio glue.
 *
 * State shape: { wantPlay, autoplayOnce, suppressed }
 *   wantPlay     — the app's DESIRED play state (LIVE transport).
 *   autoplayOnce — is the one-shot load-time autoplay still pending?
 *   suppressed   — are we currently on a music-free route?
 */

/** Should the transport actually sound right now? Used by BOTH LIVE transports
 *  (worklet + buffer source) via reconcile(). Suppressed always wins → silence. */
export function shouldSound(state) {
  return !!state.wantPlay && !state.suppressed;
}

/**
 * ENTER a music-free route. Two guarantees:
 *   1) silent NOW — wantPlay is cleared, so shouldSound() is false; and
 *   2) leaving never auto-resumes — the desired state is now "paused", so there
 *      is nothing for reconcile() to restart once suppression is lifted.
 * Also cancels the one-shot autoplay, so a fresh load that lands directly on the
 * route never starts music.
 */
export function suppress() {
  return { wantPlay: false, autoplayOnce: false, suppressed: true };
}

/**
 * LEAVE the route — UNLOCK ONLY, never resume. `suppressed` clears, but wantPlay
 * is forced back to PAUSED unconditionally: even if a play was requested while
 * suppressed (wantPlay flipped true), leaving a music-free route must stay silent.
 * autoplayOnce is left as-is (already cancelled by suppress); it is never re-armed
 * here. Only the user's explicit playback control may set wantPlay true again.
 */
export function unsuppress(state) {
  return { wantPlay: false, autoplayOnce: state.autoplayOnce, suppressed: false };
}
