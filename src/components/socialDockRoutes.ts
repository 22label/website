/**
 * Desktop Music routes that use the bottom-right social dock (Figma 289-1213).
 *
 * On these routes the three social icons sit in the bottom-right corner
 * (HomeSocialDock), the top-right menu drops its social row (Nav), and the
 * bottom-right release / "Coming Soon" previewer is retired (ReleasePreviewer).
 * Home shipped first; RELEASES / A DAY WITH / ABOUT now match it exactly.
 *
 * Single source of truth shared by those three components so the four desktop
 * pages stay consistent. Mobile is unaffected — the dock is CSS-hidden ≤767px,
 * the desktop menu is itself hidden ≤767px, and the previewer has no mobile
 * design — so mobile chrome (header/menu) is untouched.
 */
export const SOCIAL_DOCK_ROUTES = ["/", "/releases", "/a-day-with", "/about"] as const;

export function hasSocialDock(pathname: string): boolean {
  return (SOCIAL_DOCK_ROUTES as readonly string[]).includes(pathname);
}
