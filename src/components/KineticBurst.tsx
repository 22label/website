"use client";

import { EFFECTS, KINETIC } from "@/effects/effectsConfig";
import kt from "./KineticTitle.module.css";
import local from "./KineticBurst.module.css";

/**
 * Programmatically-triggered kinetic burst wrapping arbitrary inline content.
 *
 * Reuses the EXACT engine of the page-title reveal and the header logo hover burst
 * (KineticTitle.module.css `.base`/`.slice` + `ktBase`/`ktSlice` keyframes + the
 * shared KINETIC config): the real content stays sharp as `.base`, and a few
 * aria-hidden horizontal SLICE clones arrive with small offsets and settle out of
 * a light horizontal blur — the same "refraction settling", NOT a glitch/pulse.
 *
 * Only the TRIGGER differs from its siblings: the title fires once on route entry
 * and the logo fires on hover/tap, whereas this burst is CONTROLLED by the `play`
 * prop — the parent flips it false→true to play and back to false to rest, so the
 * same visual identity can acknowledge any external event (here: a blocked mixer
 * knob attempt driving the PLAY pill's Focus cue). The children are cloned into
 * every slice, so an icon + text pill is preserved intact and centred (the slices
 * overlay the exact resting box → no layout shift, no permanent offset).
 *
 * Reduced motion is handled entirely by the shared engine's CSS guard (base
 * animation removed + slices hidden), so the content simply stays at rest.
 */

// Match the logo hover burst — a smaller (~76%), ~450ms version of the full
// page-title reveal — so the pill belongs to the same kinetic identity.
const DUR_MS = 450;
const INTENSITY = 0.76;

type Slice = { top: string; bot: string; dx: string; delay: string };

// Same slice geometry as the titles/logo (desktop values), scaled by intensity.
const SLICES: Slice[] = Array.from({ length: KINETIC.slicesDesktop }, (_, i) => {
  const n = KINETIC.slicesDesktop;
  const sign = i % 2 === 0 ? 1 : -1;
  const mag = KINETIC.sliceOffsetPx * INTENSITY * (1 - (i / n) * 0.35);
  return {
    top: `${((i / n) * 100).toFixed(4)}%`,
    bot: `${(((n - i - 1) / n) * 100).toFixed(4)}%`,
    dx: `${(sign * mag).toFixed(2)}px`,
    delay: `${Math.round(i * KINETIC.staggerMs * INTENSITY)}ms`,
  };
});

/** Total burst = duration + last slice's delay (+ a small settle buffer). The
 *  parent holds `play` true for exactly this long, then drops it — removing the
 *  attribute first means the next attempt re-adds it in a later render, so the CSS
 *  animation restarts cleanly and a fresh attempt reliably re-triggers. */
export const KINETIC_BURST_MS = Math.round(
  DUR_MS + (KINETIC.slicesDesktop - 1) * KINETIC.staggerMs * INTENSITY + 60,
);

export default function KineticBurst({
  play,
  children,
  variant = "inline",
}: {
  /** While true the burst plays; flip false→true to restart it. */
  play: boolean;
  children: React.ReactNode;
  /** "inline" wraps inline content (icon + text). "surface" is a decorative,
   *  absolutely-filled full-box echo (e.g. the whole pill silhouette) that layers
   *  BEHIND the content and is invisible at rest — driven by the SAME `play` so
   *  both bursts fire in lockstep (one coordinated Focus burst, never desynced). */
  variant?: "inline" | "surface";
}) {
  const enabled = EFFECTS.ENABLE_KINETIC_TITLES;
  const surface = variant === "surface";
  const active = enabled && play;

  const hostStyle = {
    ["--kt-dur"]: `${DUR_MS}ms`,
    ["--kt-blur"]: `${(KINETIC.maxBlurPx * INTENSITY).toFixed(2)}px`,
    ["--kt-blur-mid"]: `${(KINETIC.maxBlurPx * INTENSITY * 0.25).toFixed(3)}px`,
    ["--kt-sx"]: 1 + (KINETIC.scaleXFrom - 1) * INTENSITY,
  } as React.CSSProperties;
  // The surface echo fills its positioned parent and is hidden at rest (the real
  // element shows through), appearing ONLY while the burst plays — so it can never
  // leave a permanent duplicate and returns perfectly to the resting pill. Position
  // is inline so it reliably overrides the shared `.host` position:relative.
  if (surface) {
    hostStyle.position = "absolute";
    hostStyle.inset = 0;
    hostStyle.pointerEvents = "none";
    hostStyle.opacity = active ? 1 : 0;
  }

  const hostClass = surface ? kt.host : `${kt.host} ${local.host}`;
  const baseClass = surface ? `${kt.base} ${local.baseFill}` : `${kt.base} ${local.base}`;

  return (
    <span
      className={hostClass}
      data-kt-play={active ? "1" : undefined}
      style={hostStyle}
      aria-hidden={surface ? true : undefined}
    >
      <span className={baseClass}>{children}</span>
      {enabled &&
        SLICES.map((s, i) => (
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
