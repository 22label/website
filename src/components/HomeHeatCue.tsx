"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { setHeatEnabled } from "@/effects/audioReactive";
import styles from "./HomeHeatCue.module.css";

/**
 * Home-only cue for the scroll-driven audio Heat.
 *
 * While Home is mounted it opens the Heat gate in the persistent audio engine
 * (`setHeatEnabled(true)`); the engine still only heats when music is PLAYING and
 * reads the single authoritative Home scroll progress (`telemetry.heat`), so this
 * never duplicates the scroll math. On route leave (or unmount) it closes the gate,
 * which ramps the Heat FX smoothly back to fully dry without touching playback.
 *
 * It also renders the approved instruction label. The label shows on desktop and
 * mobile portrait; the landscape blocker (z 9999) covers it in landscape. Audio
 * Heat itself only exists on the desktop Web Audio engine — on mobile the label and
 * the visual heat still apply, but playback is a bare media-channel element that
 * cannot host an insert FX bus, so its audio stays dry.
 */
export default function HomeHeatCue() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  useEffect(() => {
    setHeatEnabled(isHome);
    return () => setHeatEnabled(false);
  }, [isHome]);

  if (!isHome) return null;
  return (
    <p className={styles.cue} aria-hidden="true">
      SCROLL TO GENERATE HEAT
    </p>
  );
}
