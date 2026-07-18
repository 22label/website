"use client";

import { useEffect, useState } from "react";
import MusicPlayerControl from "./MusicPlayerControl";
import AnimatedInfo from "./AnimatedInfo";
import styles from "./MobileBottom.module.css";

/**
 * Global mobile bottom section (node 204:8528). Rendered ONCE in the shared
 * Shell, so it shows on EVERY mobile route (Home, Releases, A Day With, About,
 * …). Music player on the left, animated studio-info block on the right.
 *
 * Living in the persistent layout means it is never remounted on client-side
 * navigation: the audio (global AudioProvider) keeps playing from the same
 * timestamp and the 3s info animation never resets. It stays at --z-menu, below
 * the mobile menu overlay, so the overlay fully covers it when open.
 */
export default function MobileBottom() {
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
