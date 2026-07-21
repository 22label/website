/**
 * Navigation-arrival intent — a tiny singleton (same pattern as
 * portalTransition/effectsConfig) that records HOW the current route was entered
 * so a freshly-mounted page can pick the right entrance treatment.
 *
 * PortalNav stamps it at the exact branch points it already owns:
 *   - "portal"   → a Home↔internal monogram portal transition (desktop)
 *   - "internal" → an immediate internal↔internal route change (no portal)
 *   - "direct"   → the default: a direct load / refresh (nothing stamped yet)
 *
 * The kinetic-title reveal reads `getNavIntent().kind` ONCE on mount. It never
 * drives visuals per frame and never triggers React renders on its own.
 *
 * Mobile menu navigations are plain <Link>s (not routed through PortalNav's
 * portal path), so they are stamped "internal" directly in MobileNav's link
 * onClick (no preventDefault → navigation is unchanged). This gives mobile route
 * entries the restrained reveal while a mobile DIRECT load / refresh correctly
 * stays "direct" (non-kinetic) — `setNavIntent` is never called on the server.
 */
export type NavKind = "portal" | "internal" | "direct";

type NavIntent = { kind: NavKind; seq: number };

const state: NavIntent = { kind: "direct", seq: 0 };

/** PortalNav writes this at each navigation decision. `seq` bumps so any future
 *  consumer can tell two same-kind entries apart; the title reveal only reads
 *  `kind` on mount (component lifecycle already guarantees once-per-entry). */
export function setNavIntent(kind: NavKind): void {
  state.kind = kind;
  state.seq += 1;
}

export function getNavIntent(): Readonly<NavIntent> {
  return state;
}
