"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { setHeatEnabled } from "@/effects/audioReactive";
import styles from "./HomeHeatCue.module.css";

/**
 * Home-only cue for the scroll-driven audio Heat — the approved Figma node 246:1521
 * "[SCROLL TO GENERATE HEAT]" (Clash Display Regular 18px / 1.98px tracking / white,
 * horizontally centred, vertical centre at 76.72% of height in the 1728×1117 frame).
 *
 * Two responsibilities:
 *  1) Gate the persistent audio engine's Heat FX to a mounted Home (`setHeatEnabled`);
 *     the engine still only heats while music PLAYS and reads the authoritative Home
 *     scroll progress (telemetry.heat) — this never duplicates the scroll math. On
 *     leave/unmount the gate closes and Heat ramps fully dry.
 *  2) Show the instruction exactly ONCE per browser-tab session: it appears on the
 *     first Home view and fades out on the first meaningful Home scroll input, then
 *     stays dismissed for the rest of the session — across SPA navigation, remounts
 *     and rehydration. Dismissal is held in BOTH an in-memory module flag (so a
 *     remount / route return never re-shows it, no flash) and sessionStorage (so a
 *     brand-new tab/session shows it again) — never localStorage, which would dismiss
 *     it permanently.
 *
 * Audio Heat itself is desktop-only; on mobile the label + the visual heat apply but
 * playback is a bare media-channel element that cannot host an insert FX bus, so its
 * audio stays dry (documented, not faked).
 */

const SESSION_KEY = "h2h.heatCue.dismissed";
const FADE_MS = 280; // quick, smooth fade-out on first scroll (matches the CSS)

// In-memory session flag: survives React remounts + client navigation with NO flash.
let dismissedInMemory = false;

function readDismissed(): boolean {
  if (dismissedInMemory) return true;
  if (typeof window === "undefined") return false; // SSR: assume not dismissed
  try {
    dismissedInMemory = window.sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    /* sessionStorage blocked → rely on the in-memory flag only */
  }
  return dismissedInMemory;
}

function persistDismissed(): void {
  dismissedInMemory = true;
  try {
    window.sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* ignore — the in-memory flag still prevents re-showing this session */
  }
}

export default function HomeHeatCue() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  // Heat gate follows Home mount/unmount (independent of the label's visibility).
  useEffect(() => {
    setHeatEnabled(isHome);
    return () => setHeatEnabled(false);
  }, [isHome]);

  // `revealed` is set true only in a rAF callback AFTER mount (never synchronously in
  // an effect body) so SSR + first client render both emit null → no hydration flash;
  // `readDismissed()` in the render gate keeps it hidden once consumed this session.
  const [revealed, setRevealed] = useState(false);
  const [fading, setFading] = useState(false);
  const revealedRef = useRef(false);

  useEffect(() => {
    if (!isHome || readDismissed()) return;
    const raf = requestAnimationFrame(() => {
      revealedRef.current = true;
      setRevealed(true);
    });
    return () => cancelAnimationFrame(raf);
  }, [isHome]);

  // Leaving Home after it was shown consumes the one-time cue (no setState needed —
  // the render gate hides it, and this stops a same-session return from re-showing).
  useEffect(() => {
    if (isHome) return;
    if (revealedRef.current && !readDismissed()) persistDismissed();
  }, [isHome]);

  // Dismiss on the first MEANINGFUL Home scroll input (wheel or touch-drag), then
  // fade out. Keyed on raw input (not telemetry.heat, which reduced motion pins to 0)
  // so it dismisses under reduced motion too. Listeners are passive and self-clean.
  useEffect(() => {
    if (!isHome || !revealed || fading || readDismissed()) return;
    let wheelAcc = 0;
    let touchStartY: number | null = null;
    let done = false;

    const dismiss = () => {
      if (done) return;
      done = true;
      setFading(true);
      window.setTimeout(() => {
        persistDismissed();
        revealedRef.current = false;
        setRevealed(false);
      }, FADE_MS);
    };
    const onWheel = (e: WheelEvent) => {
      wheelAcc += Math.abs(e.deltaY);
      if (wheelAcc > 8) dismiss(); // ignore sub-notch jitter; a real scroll dismisses
    };
    const onTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY;
      if (touchStartY != null && y != null && Math.abs(y - touchStartY) > 8) {
        dismiss();
      }
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, [isHome, revealed, fading]);

  if (!isHome || !revealed || readDismissed()) return null;
  return (
    <p
      className={`${styles.cue} ${fading ? styles.fading : ""}`}
      aria-hidden="true"
    >
      [SCROLL TO GENERATE HEAT]
    </p>
  );
}
