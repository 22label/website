"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  setScratchRate,
  setHeatSuppressed,
  isWorkletTransport,
  audioMode,
} from "@/effects/audioReactive";
import { createScratchDrag } from "@/effects/marqueeScratchDrag.mjs";
import { setMarqueeScratch } from "@/effects/scratchBridge.mjs";
import {
  isMonogramHovered,
  subscribeMonogramHover,
} from "@/effects/monogramHover.mjs";
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
 *
 * Two desktop refinements ride on this same zone:
 *  • Custom scratch cursor (Figma `scratch-icon`, 48×48, centred hotspot) over the
 *    scratchable band — but SUPPRESSED over the monogram silhouette, which owns the
 *    cursor-trail affordance (Monogram publishes the silhouette-hit via monogramHover).
 *  • A first-time "[ DRAG TO SCRATCH ]" helper (Figma 246:1536), mirroring the
 *    [SCROLL TO GENERATE HEAT] cue: shown until the first marquee pointer interaction,
 *    then faded out and dismissed PERMANENTLY for the browser (localStorage) so it
 *    never returns across navigation or future visits.
 */

// The scratch hint is a genuine first-run affordance: once the user has scratched,
// it must never return for this browser. So (unlike the session-scoped Heat cue)
// dismissal persists in localStorage — plus an in-memory flag so a remount / route
// return within the session never re-shows it with no flash.
const HINT_KEY = "h2h.scratchHint.dismissed";
const HINT_FADE_MS = 280; // matches the CSS fade-out
let hintDismissedInMemory = false;

function readHintDismissed(): boolean {
  if (hintDismissedInMemory) return true;
  if (typeof window === "undefined") return false; // SSR: assume not dismissed
  try {
    hintDismissedInMemory = window.localStorage.getItem(HINT_KEY) === "1";
  } catch {
    /* localStorage blocked → rely on the in-memory flag only */
  }
  return hintDismissedInMemory;
}

function persistHintDismissed(): void {
  hintDismissedInMemory = true;
  try {
    window.localStorage.setItem(HINT_KEY, "1");
  } catch {
    /* ignore — the in-memory flag still prevents re-showing this session */
  }
}

export default function MarqueeScratch() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [enabled, setEnabled] = useState(false);
  const zoneRef = useRef<HTMLDivElement>(null);

  // First-time helper visibility (see notes above). `revealed` flips true only in a
  // rAF AFTER mount so SSR + first client render both omit it → no hydration flash.
  const [hintRevealed, setHintRevealed] = useState(false);
  const [hintFading, setHintFading] = useState(false);

  // Desktop + worklet-transport gate (client-only → null on SSR/first render, no
  // hydration flash). The worklet flag can't change without a reload.
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Scratch = the SUPPORTED DESKTOP experience only: the LIVE (non-touch) Web Audio
    // path AND the worklet transport (production default; `?transport=buffer` opts
    // out) AND AudioWorklet actually supported. Touch devices (mobile + touch
    // desktops → PRECOMPUTED_MOBILE HTMLAudioElement) get no scratch and are
    // unchanged. Desktop width gate unchanged.
    const worklet =
      audioMode() === "LIVE_WEB_AUDIO" &&
      isWorkletTransport() &&
      typeof window.AudioWorkletNode !== "undefined";
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

    // The SAME signed rate drives the audio (Stage B/C, unchanged) AND the visual
    // marquee via the bridge — one gesture state machine, no second one. Engaging a
    // scratch also ducks the scroll-Heat FX to dry (Stage D) for a clean scratch path.
    const drag = createScratchDrag({
      onRate: (r) => {
        setScratchRate(r);
        setMarqueeScratch(true, r);
        setHeatSuppressed(true); // Stage D: duck Heat FX to dry while scratching
      },
    });
    let pointerId = -1;
    let raf = 0;

    const loop = () => {
      drag.frame();
      raf = drag.isActive() ? requestAnimationFrame(loop) : 0;
    };
    const end = () => {
      drag.end(); // audio: restores rate 1 if a scratch was engaged
      setMarqueeScratch(false, 1); // visual: hand the marquee back to its idle scroll
      setHeatSuppressed(false); // Stage D: restore the current scroll-derived Heat
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

  // Custom scratch cursor over the band, SUPPRESSED over the monogram silhouette.
  // Toggled straight on the DOM (not React state) so the per-move hover signal never
  // triggers a re-render. Monogram is the raycast authority (monogramHover bridge).
  useEffect(() => {
    if (!enabled || !isHome) return;
    const el = zoneRef.current;
    if (!el) return;
    const apply = (hovered: boolean) =>
      el.classList.toggle(styles.overMonogram, hovered);
    apply(isMonogramHovered());
    const unsubscribe = subscribeMonogramHover(apply);
    return () => {
      unsubscribe();
      el.classList.remove(styles.overMonogram);
    };
  }, [enabled, isHome]);

  // Reveal the first-time helper (once per browser). rAF-after-mount avoids the SSR
  // flash; `readHintDismissed()` keeps it hidden the moment it has been consumed.
  useEffect(() => {
    if (!enabled || !isHome || readHintDismissed()) return;
    const raf = requestAnimationFrame(() => setHintRevealed(true));
    return () => cancelAnimationFrame(raf);
  }, [enabled, isHome]);

  // First marquee pointer interaction dismisses the helper: fade out, then persist so
  // it never returns (this browser) across navigation or future visits.
  useEffect(() => {
    if (!enabled || !isHome || readHintDismissed()) return;
    const el = zoneRef.current;
    if (!el) return;
    let done = false;
    const dismiss = () => {
      if (done) return;
      done = true;
      setHintFading(true);
      window.setTimeout(() => {
        persistHintDismissed();
        setHintRevealed(false);
      }, HINT_FADE_MS);
    };
    el.addEventListener("pointerdown", dismiss, { passive: true });
    return () => el.removeEventListener("pointerdown", dismiss);
  }, [enabled, isHome]);

  if (!enabled || !isHome) return null;
  const showHint = hintRevealed && !readHintDismissed();
  // Drag hit-area (`zone`) — carries the scratch cursor; the helper label sits above
  // it at the 64px viewport margin and never intercepts pointer events.
  return (
    <>
      <div ref={zoneRef} className={styles.zone} aria-hidden="true" />
      {showHint && (
        <p
          className={`${styles.hint} ${hintFading ? styles.hintFading : ""}`}
          aria-hidden="true"
        >
          [ DRAG TO SCRATCH ]
        </p>
      )}
    </>
  );
}
