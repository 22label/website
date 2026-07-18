"use client";

import { useEffect, useState } from "react";
import AnimatedInfo from "./AnimatedInfo";
import MusicPlayerControl from "./MusicPlayerControl";
import styles from "./DesktopRail.module.css";

/**
 * Desktop bottom-left rail (nodes 212:601 + 212:483), rendered by the shared
 * Shell on every desktop route. One horizontal rail anchored left:64 / bottom:64
 * with a 64px gap: animated studio-info block on the left, persistent music
 * player on the right, bottom edges aligned. Desktop-only (>=768px).
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
    <div className={styles.rail}>
      <AnimatedInfo variant="desktop" />
      <MusicPlayerControl variant="desktop" />
    </div>
  );
}
