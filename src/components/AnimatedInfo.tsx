"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./AnimatedInfo.module.css";

/**
 * Animated studio-info block (desktop node 212:601, mobile node 212:554).
 * A fixed-height, overflow-hidden viewport alternates every 3s between
 * BASE/BARCELONA [ES] and EST./2026, with a STATIC line below it that never
 * moves, fades, resizes, or re-mounts.
 *
 * Desktop: 16px/1.76px, left-aligned, 151px line. Mobile: 8px/12px, right-
 * aligned, 113px line. Only the two text rows animate (slight vertical slide +
 * crossfade); the two phases share one grid cell so the viewport height is
 * constant (no layout shift). Reduced motion drops the slide for a plain
 * crossfade. The 3s interval is created once, paused while the tab is hidden,
 * and cleaned up on unmount.
 */
const PHASES = [
  { label: "BASE", value: "BARCELONA [ES]" },
  { label: "EST.", value: "2026" },
] as const;

const INTERVAL_MS = 3000;

/** The BASE location reads "BCN [ES]" on the mobile bottom section (Figma
 *  230:404); the desktop copy is unchanged. Only this one value is variant-aware. */
function phaseValue(i: number, variant: "desktop" | "mobile") {
  if (variant === "mobile" && PHASES[i].label === "BASE") return "BCN [ES]";
  return PHASES[i].value;
}

export default function AnimatedInfo({
  variant,
}: {
  variant: "desktop" | "mobile";
}) {
  const idxRef = useRef(0);
  const [view, setView] = useState<{
    cur: number;
    prev: number | null;
    tick: number;
  }>({ cur: 0, prev: null, tick: 0 });

  useEffect(() => {
    let id = 0;
    const advance = () => {
      const prev = idxRef.current;
      const cur = 1 - prev;
      idxRef.current = cur;
      setView((v) => ({ cur, prev, tick: v.tick + 1 }));
    };
    const start = () => {
      if (!id) id = window.setInterval(advance, INTERVAL_MS);
    };
    const stop = () => {
      if (id) {
        clearInterval(id);
        id = 0;
      }
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div
      className={`${styles.info} ${
        variant === "mobile" ? styles.mobile : styles.desktop
      }`}
    >
      <div className={styles.infoViewport}>
        {view.prev !== null && (
          <div
            key={`p${view.tick}`}
            className={`${styles.phase} ${styles.phaseLeave}`}
            aria-hidden="true"
          >
            <span className={styles.infoLabel}>{PHASES[view.prev].label}</span>
            <span className={styles.infoValue}>
              {phaseValue(view.prev, variant)}
            </span>
          </div>
        )}
        <div
          key={`c${view.tick}`}
          className={`${styles.phase} ${styles.phaseEnter}`}
        >
          <span className={styles.infoLabel}>{PHASES[view.cur].label}</span>
          <span className={styles.infoValue}>{phaseValue(view.cur, variant)}</span>
        </div>
      </div>
      <span className={styles.infoLine} aria-hidden="true" />
    </div>
  );
}
