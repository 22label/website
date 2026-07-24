/**
 * Shared signal: is the desktop pointer currently over the monogram silhouette?
 *
 * The Monogram WebGL loop is the ONLY authority that can answer this — it owns the
 * camera + mesh and already raycasts the pointer against the real silhouette every
 * move (`trailHit`, the same test that gates the cursor trail). It publishes that
 * result here; the DOM marquee-scratch overlay subscribes to SUPPRESS its custom
 * scratch cursor while the pointer is over the monogram (which owns the cursor-trail
 * affordance we must leave unchanged) and restore it over the rest of the scratchable
 * marquee band. Publish/subscribe only — no gesture state, no scroll/raycast math is
 * duplicated here. The signal only ever goes true while the trail is actually active
 * (Monogram publishes from the trail handler), so reduced-motion / no-trail sessions
 * simply never suppress — there is no trail to protect there.
 */

let hovered = false;
const listeners = new Set();

/** Monogram → bridge. `next` is true while the pointer is over the silhouette. */
export function setMonogramHovered(next) {
  const v = !!next;
  if (v === hovered) return;
  hovered = v;
  for (const fn of listeners) fn(v);
}

/** @returns {boolean} whether the pointer is currently over the monogram silhouette. */
export function isMonogramHovered() {
  return hovered;
}

/**
 * Subscribe to hover changes. Returns an unsubscribe function.
 * @param {(hovered: boolean) => void} fn
 * @returns {() => void}
 */
export function subscribeMonogramHover(fn) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
