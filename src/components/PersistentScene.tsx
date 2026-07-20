"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Monogram from "./Monogram";
import { PORTAL, setIdleRest } from "@/effects/portalTransition";

/**
 * Persistent WebGL scene host.
 *
 * Desktop (>= PORTAL.minWidthPx): the monogram is mounted ONCE and survives every
 * client-side route change (the portal transition needs a persistent scene — no
 * remount of renderer/monogram/marquee/audio). Mobile & narrow desktop: mounted
 * only on Home, exactly as before (unchanged behaviour).
 *
 * It also publishes the current route's REST presence to the portal module: 1 on
 * Home (or below the desktop breakpoint) so the scene is visible, 0 on internal
 * desktop routes so the canvas fades out and those pages look identical to today.
 */
export default function PersistentScene() {
  const pathname = usePathname();
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${PORTAL.minWidthPx}px)`);
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    // Publish the current route's rest presence to the portal module (external
    // system): Home (or below desktop) → visible (1); internal desktop → 0.
    setIdleRest(!isDesktop || pathname === "/" ? 1 : 0);
  }, [pathname, isDesktop]);

  // Desktop: always mounted (persistent across routes). Mobile / narrow desktop:
  // Home-only, exactly as before (server + first client render agree).
  const show = isDesktop || pathname === "/";
  return show ? <Monogram initialOpacity={pathname === "/" ? 1 : 0} /> : null;
}
