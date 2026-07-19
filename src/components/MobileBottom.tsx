"use client";

import { useEffect, useRef, useState } from "react";
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
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Publish the real rendered height of this bottom section as a CSS custom
  // property so the page content (e.g. Releases) can reserve exactly the space
  // it occupies and never let the cover/icons slip behind it on short screens.
  // Cleared when it unmounts / leaves mobile so desktop is unaffected.
  useEffect(() => {
    const el = sectionRef.current;
    const root = document.documentElement;
    if (!isMobile || !el) {
      root.style.removeProperty("--mobile-bottom-height");
      return;
    }
    const ro = new ResizeObserver(() => {
      root.style.setProperty(
        "--mobile-bottom-height",
        `${Math.round(el.getBoundingClientRect().height)}px`,
      );
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--mobile-bottom-height");
    };
  }, [isMobile]);

  if (!isMobile) return null;

  return (
    <section
      ref={sectionRef}
      className={styles.bottom}
      aria-label="Studio information"
    >
      <MusicPlayerControl variant="mobile" />
      <AnimatedInfo variant="mobile" />
    </section>
  );
}
