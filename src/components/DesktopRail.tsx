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
 * user attempts to operate one, the CTA flashes a green glow for ~1s. One continuous
 * attempt = one pulse (coalesced via `focusBusy`, no per-event restart); a short
 * cooldown after the fade lets a genuinely new attempt trigger it again. All timers
 * are cleared on unmount.
 */
export default function DesktopRail() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [playFocus, setPlayFocus] = useState(false);
  const focusBusy = useRef(false);
  const fadeTimer = useRef<number | null>(null);
  const cooldownTimer = useRef<number | null>(null);

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
    fadeTimer.current = window.setTimeout(() => {
      setPlayFocus(false); // remove the class → CSS returns to no-shadow, no residual
      cooldownTimer.current = window.setTimeout(() => {
        focusBusy.current = false; // a new independent attempt may now retrigger
      }, 140);
    }, 1000);
  }, []);

  useEffect(
    () => () => {
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
      if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
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
