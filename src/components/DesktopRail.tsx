"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MusicPlayerControl from "./MusicPlayerControl";
import Mixer from "./Mixer";
import styles from "./DesktopRail.module.css";

/**
 * Desktop bottom-left rail, rendered by the shared Shell on every desktop route.
 * Anchored left:64 / bottom:64 — the persistent music-player pill + the MIXER.
 * Desktop-only (>=768px).
 *
 * Owns the PLAY "Focus" feedback: when the knobs are locked (playback off) and the
 * user attempts to operate one, the CTA plays a short kinetic impulse (~500ms). A
 * single continuous attempt (e.g. a wheel burst) coalesces into one impulse via
 * `focusBusy`; the flag clears exactly when the impulse ends, so the very next
 * blocked attempt reliably restarts it — even one that just finished. The timer is
 * cleared on unmount.
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
    // Hold the class for the impulse duration (~500ms), then drop it AND clear the
    // busy flag together. Removing the class first means the next blocked attempt
    // re-adds it in a later render → the CSS animation restarts cleanly, so a fresh
    // attempt reliably re-triggers even right after the previous one completed.
    endTimer.current = window.setTimeout(() => {
      setPlayFocus(false);
      focusBusy.current = false;
    }, 520);
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
