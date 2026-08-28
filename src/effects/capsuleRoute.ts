/**
 * Single source of truth for the CAPSULE fashion hub route. It opts OUT of the
 * shared music/WebGL shell, so BOTH the Shell chrome exclusion and the audio
 * lockout consult this predicate — they can never disagree about which routes are
 * a music-free, chrome-free environment.
 */
export const CAPSULE_PATH = "/capsule";
/** Public teaser page, distinct from the WIP shop hub at /capsule. */
export const CAPSULE_COMING_SOON_PATH = "/capsule-coming-soon";

/**
 * A route is "capsule-isolated" — music-free + chrome-free — when it is the real WIP
 * shop (the /capsule hub, collections and product pages) OR the public Coming Soon
 * teaser (/capsule-coming-soon). Both opt out of the shared music/WebGL shell and are
 * included in the SAME audio suppression policy (no music, no autoplay, no auto-resume
 * on leave). Kept as one predicate so the Shell chrome exclusion and the audio lockout
 * can never disagree about which routes are a music-free environment.
 */
export function isCapsuleRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return (
    pathname === CAPSULE_PATH ||
    pathname.startsWith(CAPSULE_PATH + "/") ||
    pathname === CAPSULE_COMING_SOON_PATH ||
    pathname.startsWith(CAPSULE_COMING_SOON_PATH + "/")
  );
}

/**
 * The CAPSULE entry in the MUSIC menu. It points to the PUBLIC Coming Soon teaser
 * (same tab, real Next.js link) — NEVER the WIP shop hub at /capsule, which stays
 * reachable only directly / via preview. Single source of truth for the rendered
 * link so Nav.tsx and MobileNav.tsx cannot drift on the target.
 */
export const CAPSULE_MUSIC_LINK = {
  label: "CAPSULE",
  href: CAPSULE_COMING_SOON_PATH,
} as const;
