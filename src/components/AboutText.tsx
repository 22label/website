"use client";

import { useEffect, useRef, useState } from "react";
import { usePortalHold } from "./PortalNav";
import styles from "@/app/about/about.module.css";

/**
 * Visual typewriter (client only). The full text is always in the DOM:
 * - a visibility:hidden "ghost" reserves the exact block size (no layout shift)
 * - an sr-only copy exposes the complete text to screen readers
 * - an aria-hidden overlay reveals characters progressively (<= 1500ms)
 * Restarts on mount (route re-entry); respects prefers-reduced-motion.
 */
export default function AboutText({ text }: { text: string }) {
  const [count, setCount] = useState(0);
  const [done, setDone] = useState(false);
  const rafRef = useRef(0);
  const startRef = useRef(0);
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // While a forward portal dive is covering, don't type behind the glass — start
  // only once the content is being revealed (starts once, never twice).
  const hold = usePortalHold();

  useEffect(() => {
    if (hold) return; // held behind the portal cover — wait for reveal
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const DURATION = reduce ? 0 : 1400; // total typing time, < 1500ms
    const START_DELAY = reduce ? 0 : 450; // after the title fade-in

    const tick = (now: number) => {
      if (!startRef.current) startRef.current = now;
      const p =
        DURATION === 0 ? 1 : Math.min(1, (now - startRef.current) / DURATION);
      setCount(Math.floor(p * text.length));
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setCount(text.length);
        setDone(true);
      }
    };

    delayRef.current = setTimeout(() => {
      rafRef.current = requestAnimationFrame(tick);
    }, START_DELAY);

    return () => {
      if (delayRef.current) clearTimeout(delayRef.current);
      cancelAnimationFrame(rafRef.current);
    };
  }, [text, hold]);

  return (
    <div className={styles.typeWrap}>
      {/* reserves the full block size so nothing shifts while typing */}
      <p className={styles.ghost} aria-hidden="true">
        {text}
      </p>
      {/* the visible, progressively-typed copy */}
      <p className={styles.typed} aria-hidden="true">
        {text.slice(0, count)}
        {!done && <span className={styles.cursor} />}
      </p>
      {/* full text for assistive tech */}
      <p className={styles.srOnly}>{text}</p>
    </div>
  );
}
