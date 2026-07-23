"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MusicPlayerControl from "./MusicPlayerControl";
import { KINETIC_BURST_MS } from "./KineticBurst";
import Mixer from "./Mixer";
import styles from "./DesktopRail.module.css";

/**
 * Desktop bottom-left rail, rendered by the shared Shell on every desktop route.
 * Anchored left:64 / bottom:64 — the persistent music-player pill + the MIXER.
 * Desktop-only (>=768px).
 *
 * Owns the PLAY "Focus" feedback: when the knobs are locked (playback off) and the
 * user attempts to operate one, the CTA plays the shared kinetic burst (the exact
 * page-title / logo effect) on the pill content. A single continuous attempt (e.g.
 * a wheel burst) coalesces into one burst via `focusBusy`; the flag clears exactly
 * when the burst ends, so the very next blocked attempt reliably restarts it — even
 * one that just finished. The timer is cleared on unmount.
 */
export default function DesktopRail() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [playFocus, setPlayFocus] = useState(false);
  const focusBusy = useRef(false);
  const endTimer = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const requestPlayFocus = useCallback(() => {
    if (focusBusy.current) return; // coalesce every event of the same attempt
    focusBusy.current = true;
    setPlayFocus(true);
    // Hold the flag for the burst duration, then drop it AND clear the busy flag
    // together. Removing the flag first means the next blocked attempt re-adds it
    // in a later render → the CSS animation restarts cleanly, so a fresh attempt
    // reliably re-triggers even right after the previous one completed.
    endTimer.current = window.setTimeout(() => {
      setPlayFocus(false);
      focusBusy.current = false;
    }, KINETIC_BURST_MS);
  }, []);

  useEffect(
    () => () => {
      if (endTimer.current) clearTimeout(endTimer.current);
    },
    [],
  );

  if (!isDesktop) return null;

  return (
    <>
      <Mixer onLockedAttempt={requestPlayFocus} />
      <div className={styles.rail}>
        <MusicPlayerControl variant="desktop" focus={playFocus} />
      </div>
    </>
  );
}
