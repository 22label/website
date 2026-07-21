"use client";

import { useState } from "react";
import { EFFECTS, KINETIC } from "@/effects/effectsConfig";
import { getNavIntent } from "@/effects/navIntent";
import styles from "./KineticTitle.module.css";

/**
 * Materialization / "refraction settling" heading reveal for the route titles.
 *
 * The real, semantic <h1> text is ALWAYS present and sharp by default, so if
 * JS/animation is unavailable the heading is fully visible with the site's
 * existing `titleIn` entrance (this component keeps the page's own `className`).
 * When a reveal applies, a few decorative, `aria-hidden` horizontal SLICE clones
 * arrive with small timing offsets and converge while the base text settles out
 * of a light horizontal blur. Slices are absolutely positioned over the
 * heading's exact box → no layout shift; screen readers read the title once.
 *
 * Flash-safety: the decision is made in a LAZY useState initializer — during the
 * component's FIRST render, never in an effect after paint. For a client-side
 * navigation (the only animated path) the first paint already carries the
 * animation's `from` state (backwards fill via `both`); the title is never
 * painted sharp and then jumped back into blur.
 *
 * Hydration-safety: `setNavIntent` is only ever called from client event
 * handlers, so on the server the intent is always its initial "direct" and the
 * initializer returns null. A direct load / refresh is the ONLY server-rendered
 * case, and it returns null on the client too (direct is rejected before any
 * breakpoint branch) → identical server/client markup on both breakpoints.
 * Reduced motion resolves instantly (initializer returns null + a CSS guard).
 */

type Slice = { top: string; bot: string; dx: string; delay: string };
type Reveal = { durMs: number; blurPx: number; blurMidPx: number; slices: Slice[] };

/** Decide the reveal ONCE, during first render. Returns null for SSR, disabled,
 *  reduced motion, or a direct load — all of which keep the plain sharp heading. */
function computeReveal(): Reveal | null {
  if (!EFFECTS.ENABLE_KINETIC_TITLES) return null;
  if (typeof window === "undefined") return null;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;

  const kind = getNavIntent().kind;
  // Reject direct load / refresh BEFORE choosing a breakpoint timing, so server
  // (window===undefined) and client hydration (kind==="direct") always agree.
  if (kind === "direct") return null;

  const mobile = window.innerWidth <= 767;
  // Mobile has no portal, so it uses one restrained timing; desktop splits
  // portal vs internal. (Past the guard, kind is only "portal" or "internal".)
  const durMs = mobile
    ? KINETIC.mobileMs
    : kind === "portal"
      ? KINETIC.portalMs
      : KINETIC.internalMs;

  const n = mobile ? KINETIC.slicesMobile : KINETIC.slicesDesktop;
  const blurPx = mobile ? KINETIC.mobileBlurPx : KINETIC.maxBlurPx;
  const offsetPx = mobile ? KINETIC.mobileOffsetPx : KINETIC.sliceOffsetPx;

  // Precompute each slice's band + arrival so the CSS uses only plain-value
  // variables (no calc() multiplication/division for cross-browser safety).
  const slices: Slice[] = Array.from({ length: n }, (_, i) => {
    const sign = i % 2 === 0 ? 1 : -1;
    const mag = offsetPx * (1 - (i / n) * 0.35);
    return {
      top: `${((i / n) * 100).toFixed(4)}%`,
      bot: `${(((n - i - 1) / n) * 100).toFixed(4)}%`,
      dx: `${(sign * mag).toFixed(2)}px`,
      delay: `${i * KINETIC.staggerMs}ms`,
    };
  });

  return { durMs, blurPx, blurMidPx: Number((blurPx * 0.25).toFixed(3)), slices };
}

export default function KineticTitle({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const [reveal] = useState<Reveal | null>(computeReveal);

  const hostStyle = reveal
    ? ({
        ["--kt-dur"]: `${reveal.durMs}ms`,
        ["--kt-blur"]: `${reveal.blurPx}px`,
        ["--kt-blur-mid"]: `${reveal.blurMidPx}px`,
        ["--kt-sx"]: KINETIC.scaleXFrom,
      } as React.CSSProperties)
    : undefined;

  return (
    <h1
      className={`${className ?? ""} ${styles.host}`}
      data-kt-play={reveal ? "1" : undefined}
      style={hostStyle}
    >
      <span className={styles.base}>{children}</span>
      {reveal?.slices.map((s, i) => (
        <span
          key={i}
          className={styles.slice}
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
    </h1>
  );
}
