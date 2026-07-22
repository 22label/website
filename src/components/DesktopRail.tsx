"use client";

import { useEffect, useState } from "react";
import MusicPlayerControl from "./MusicPlayerControl";
import Mixer from "./Mixer";
import styles from "./DesktopRail.module.css";

/**
 * Desktop bottom-left rail, rendered by the shared Shell on every desktop route.
 * Anchored left:64 / bottom:64 — now the persistent music-player pill ONLY (the
 * previous animated studio-info block was removed from this corner). The
 * AnimatedInfo component itself still lives on the mobile bottom section.
 * Desktop-only (>=768px).
 */
export default function DesktopRail() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  if (!isDesktop) return null;

  return (
    <>
      <Mixer />
      <div className={styles.rail}>
        <MusicPlayerControl variant="desktop" />
      </div>
    </>
  );
}
