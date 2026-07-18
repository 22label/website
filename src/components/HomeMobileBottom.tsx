"use client";

import { useEffect, useState } from "react";
import MusicPlayerControl from "./MusicPlayerControl";
import AnimatedInfo from "./AnimatedInfo";
import styles from "./HomeMobileBottom.module.css";

/**
 * Home mobile bottom section (nodes 204:8528 / 204:6998). Mobile-only (<768px),
 * Home-only. Replaces the previous static mobile bottom info: music player on
 * the left, animated studio-info block on the right. Anchored at the bottom of
 * the Home viewport, it stays in the DOM under the mobile menu overlay (which
 * covers it when open). Never mounted on desktop, so only one <audio> exists.
 */
export default function HomeMobileBottom() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  if (!isMobile) return null;

  return (
    <section className={styles.bottom} aria-label="Studio information">
      <MusicPlayerControl variant="mobile" />
      <AnimatedInfo variant="mobile" />
    </section>
  );
}
