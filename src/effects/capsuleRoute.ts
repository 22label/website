/**
 * Single source of truth for the CAPSULE fashion hub route. It opts OUT of the
 * shared music/WebGL shell, so BOTH the Shell chrome exclusion and the audio
 * lockout consult this predicate — they can never disagree about which routes are
 * a music-free, chrome-free environment.
 */
export const CAPSULE_PATH = "/capsule";

export function isCapsuleRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === CAPSULE_PATH || pathname.startsWith(CAPSULE_PATH + "/");
}
