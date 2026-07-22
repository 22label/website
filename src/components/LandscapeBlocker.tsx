"use client";

import { useEffect, useState } from "react";
import styles from "./LandscapeBlocker.module.css";

/**
 * Full-screen overlay shown ONLY on phones held in landscape. The site is designed
 * portrait-first on mobile; a rotated phone gets this blocker until it is rotated
 * back. Detection is in JS (not @media) so the phone gate is by viewport height,
 * not device class: landscape (innerWidth > innerHeight) AND phone-sized
 * (innerHeight <= 550). Tablets and desktops in landscape are never blocked.
 *
 * Recomputed on mount, resize and orientationchange; listeners removed on cleanup.
 * While visible it locks body scroll (saved/restored, never left mutated) and, via
 * pointer-events, blocks all interaction with the UI underneath. Figma 230:779.
 */
export default function LandscapeBlocker() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const compute = () => {
      const isLandscape = window.innerWidth > window.innerHeight;
      const isPhone = window.innerHeight <= 550;
      setVisible(isLandscape && isPhone);
    };
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("orientationchange", compute);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("orientationchange", compute);
    };
  }, []);

  // Lock body scroll only while blocking; restore the previous value on hide/unmount.
  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div className={styles.blocker} role="alertdialog" aria-modal="true" aria-label="Rotate your device">
      <p className={styles.copy}>
        <span className={styles.line}>ROTATE THE RECORD,</span>
        <span className={styles.line}>NOT YOUR PHONE.</span>
      </p>
    </div>
  );
}
