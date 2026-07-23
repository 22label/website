"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { setScratchRate } from "@/effects/audioReactive";
import { createScratchDrag } from "@/effects/marqueeScratchDrag.mjs";
import styles from "./MarqueeScratch.module.css";

/**
 * Stage C — desktop marquee "scratch". A horizontal drag over the central marquee
 * band drives the SIGNED scratch rate of the AudioWorklet transport (Stage B):
 * drag right → forward, left → reverse, held still → 0, release → normal forward (1).
 *
 * Scope: DESKTOP + Home + ?transport=worklet only (the same opt-in the whole scratch
 * feature lives behind). It's a DOM overlay zone — it does NOT touch the WebGL
 * marquee, so the marquee's idle animation/layout/appearance are preserved, and the
 * AudioBufferSourceNode default + mobile are unaffected. A plain click never engages
 * (engage threshold), so navigation is not affected. All termination paths
 * (pointerup/cancel, lost capture, tab hidden, unmount) restore rate 1 and clean up.
 * This checkpoint scratches AUDIO only; the visual marquee is intentionally left on
 * its idle scroll (visual↔audio sync would require driving the Monogram loop).
 */
export default function MarqueeScratch() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [enabled, setEnabled] = useState(false);
  const zoneRef = useRef<HTMLDivElement>(null);

  // Desktop + worklet-transport gate (client-only → null on SSR/first render, no
  // hydration flash). The worklet flag can't change without a reload.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let worklet = false;
    try {
      worklet =
        new URLSearchParams(window.location.search).get("transport") === "worklet";
    } catch {
      worklet = false;
    }
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setEnabled(worklet && mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!enabled || !isHome) return;
    const el = zoneRef.current;
    if (!el) return;

    const drag = createScratchDrag({ onRate: setScratchRate });
    let pointerId = -1;
    let raf = 0;

    const loop = () => {
      drag.frame();
      raf = drag.isActive() ? requestAnimationFrame(loop) : 0;
    };
    const end = () => {
      drag.end(); // restores rate 1 if a scratch was engaged
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      if (pointerId !== -1) {
        try {
          el.releasePointerCapture(pointerId);
        } catch {
          /* already released */
        }
        pointerId = -1;
      }
    };
    const onDown = (e: PointerEvent) => {
      if (drag.isActive() || e.button !== 0) return;
      pointerId = e.pointerId;
      drag.down(e.clientX);
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* capture unsupported — window/element listeners still track it */
      }
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId === pointerId) drag.move(e.clientX);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId === pointerId) end();
    };
    const onVisibility = () => {
      if (document.hidden) end();
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("lostpointercapture", end);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("lostpointercapture", end);
      document.removeEventListener("visibilitychange", onVisibility);
      end(); // unmount safety: restore rate 1, cancel rAF, release capture
    };
  }, [enabled, isHome]);

  if (!enabled || !isHome) return null;
  return (
    <div ref={zoneRef} className={styles.zone} aria-hidden="true">
      <p className={styles.label}>[DRAG TO SCRATCH]</p>
    </div>
  );
}
