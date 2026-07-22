"use client";

import { useEffect, useRef } from "react";
import { EFFECTS, KINETIC } from "@/effects/effectsConfig";
import kt from "./KineticTitle.module.css";
import local from "./KineticLogo.module.css";

/**
 * Hover-only kinetic burst for the header "2HOT2HANDLE" wordmark.
 *
 * Reuses the EXACT engine of the page-title reveal (KineticTitle.module.css
 * keyframes `ktBase`/`ktSlice` + the shared KINETIC config): the real content is
 * kept sharp as `.base`, and a few aria-hidden horizontal SLICE clones arrive with
 * small offsets and settle. The wordmark is an <img> (an SVG file), so the slice
 * mechanism clones the image — no per-letter text needed. Only the TRIGGER differs
 * from the titles: instead of firing once on route entry, one burst plays on
 * pointer-enter, then the `data-kt-play` attribute is removed so it settles to the
 * exact original and can replay on the next hover.
 *
 * Scaled to ~76% of the title intensity and ~450ms for the smaller mark. The burst
 * only ever activates on desktop fine-pointer devices — the listener is attached
 * in an effect gated on `(hover:hover) and (pointer:fine)` + reduced-motion, so
 * touch / mobile / reduced-motion never animate (the clones stay inert: opacity 0,
 * pointer-events:none, no `data-kt-play`). pointerenter (not pointerover) fires
 * once for the host and never re-fires while moving between the inner clones, so
 * moving across the mark cannot re-trigger it. The markup is deterministic
 * (server === client) so there is no hydration flash.
 */
const HOVER_DUR_MS = 450; // one burst (target 400–500ms)
const HOVER_INTENSITY = 0.76; // ~76% of the page-title intensity (target 70–80%)

type Slice = { top: string; bot: string; dx: string; delay: string };

// Same slice geometry as the titles (desktop values), scaled by intensity.
const SLICES: Slice[] = Array.from({ length: KINETIC.slicesDesktop }, (_, i) => {
  const n = KINETIC.slicesDesktop;
  const sign = i % 2 === 0 ? 1 : -1;
  const mag = KINETIC.sliceOffsetPx * HOVER_INTENSITY * (1 - (i / n) * 0.35);
  return {
    top: `${((i / n) * 100).toFixed(4)}%`,
    bot: `${(((n - i - 1) / n) * 100).toFixed(4)}%`,
    dx: `${(sign * mag).toFixed(2)}px`,
    delay: `${Math.round(i * KINETIC.staggerMs * HOVER_INTENSITY)}ms`,
  };
});
// Total burst = duration + last slice's delay (+ a small settle buffer).
const TOTAL_MS = Math.round(
  HOVER_DUR_MS +
    (KINETIC.slicesDesktop - 1) * KINETIC.staggerMs * HOVER_INTENSITY +
    60,
);

export default function KineticLogo({ children }: { children: React.ReactNode }) {
  const hostRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!EFFECTS.ENABLE_KINETIC_TITLES) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const host = hostRef.current;
    if (!host) return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    let playing = false;
    let timer = 0;
    // One burst per trigger. The `playing` guard ignores re-triggers mid-cycle
    // (the component's safe replay behaviour — no stacking), and the timeout always
    // settles the mark back to its exact resting state.
    const burst = () => {
      if (playing) return;
      playing = true;
      host.setAttribute("data-kt-play", "1");
      timer = window.setTimeout(() => {
        host.removeAttribute("data-kt-play");
        playing = false;
      }, TOTAL_MS);
    };

    // DESKTOP (fine pointer): unchanged — one burst on hover-enter.
    const onEnter = () => burst();

    // MOBILE / touch: one deliberate TAP = one burst. Fires on pointerup so it
    // starts immediately (before any link navigation) with no artificial delay; a
    // dragged finger (moved) is ignored so a scroll/swipe can't trigger it.
    let armed = false;
    let dx = 0;
    let dy = 0;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      armed = true;
      dx = e.clientX;
      dy = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || !armed) return;
      armed = false;
      if (Math.hypot(e.clientX - dx, e.clientY - dy) < 12) burst();
    };

    if (fine) {
      host.addEventListener("pointerenter", onEnter);
    } else {
      host.addEventListener("pointerdown", onDown);
      host.addEventListener("pointerup", onUp);
    }
    return () => {
      host.removeEventListener("pointerenter", onEnter);
      host.removeEventListener("pointerdown", onDown);
      host.removeEventListener("pointerup", onUp);
      if (timer) window.clearTimeout(timer);
      host.removeAttribute("data-kt-play");
    };
  }, []);

  const hostStyle = {
    ["--kt-dur"]: `${HOVER_DUR_MS}ms`,
    ["--kt-blur"]: `${(KINETIC.maxBlurPx * HOVER_INTENSITY).toFixed(2)}px`,
    ["--kt-blur-mid"]: `${(KINETIC.maxBlurPx * HOVER_INTENSITY * 0.25).toFixed(3)}px`,
    ["--kt-sx"]: 1 + (KINETIC.scaleXFrom - 1) * HOVER_INTENSITY,
  } as React.CSSProperties;

  return (
    <span ref={hostRef} className={`${kt.host} ${local.logoHost}`} style={hostStyle}>
      <span className={kt.base}>{children}</span>
      {SLICES.map((s, i) => (
        <span
          key={i}
          className={kt.slice}
          aria-hidden="true"
          style={
            {
              ["--kt-top"]: s.top,
              ["--kt-bot"]: s.bot,
              ["--kt-dx"]: s.dx,
              ["--kt-delay"]: s.delay,
            } as React.CSSProperties
          }
        >
          {children}
        </span>
      ))}
    </span>
  );
}
