"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { CARD, EFFECTS } from "@/effects/effectsConfig";
import styles from "./ReleasePreviewer.module.css";

/**
 * Bottom-right release previewer — shared across routes, anchored bottom-right,
 * grows up + left on hover.
 *
 * On Home (desktop) it also renders a right-edge protective gradient that fades
 * in with the same CSS hover/focus state that expands the player. The gradient is
 * a child of .release, pointer-events:none and aria-hidden, above the marquee but
 * below the release copy.
 *
 * PHYSICAL CARD (desktop hover only): an inner `.card` wrapper gets a weighted
 * ≤2° tilt + an opposite image-crop parallax + a single reflection sweep on
 * hover-enter, driven by ONE rAF writing inline transforms from lerped targets
 * (no React re-render per frame) and settling exactly back to rest on leave. The
 * tilt lives on `.card`, NOT on `.release`, so the fixed `.rightGradient` keeps
 * the viewport as its containing block. Reduced motion or a non-hover pointer →
 * nothing attaches; the CSS reveal still runs.
 */
const DETAILS = [
  "2H2H001",
  "MARCOS BAIANO",
  "BACK TO THE FUTURE EP",
  "+TERENCE :TERRY: REMIX",
] as const;

export default function ReleasePreviewer() {
  const isHome = usePathname() === "/";

  const rootRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const coverRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!EFFECTS.ENABLE_PHYSICAL_CARD) return;
    const root = rootRef.current;
    const card = cardRef.current;
    const cover = coverRef.current;
    if (!root || !card || !cover) return;
    // Desktop hover pointers only; reduced motion opts out entirely.
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    card.style.setProperty("--card-shine-ms", `${CARD.shineMs}ms`);

    const cur = { rx: 0, ry: 0, px: 0, py: 0, h: 0 };
    const tgt = { rx: 0, ry: 0, px: 0, py: 0, h: 0 };
    let hovering = false;
    let raf = 0;

    const apply = () => {
      card.style.transform = `perspective(${CARD.perspectivePx}px) rotateX(${cur.rx.toFixed(3)}deg) rotateY(${cur.ry.toFixed(3)}deg)`;
      cover.style.transform = `translate(${cur.px.toFixed(2)}px, ${cur.py.toFixed(2)}px) scale(${(1 + CARD.coverZoom * cur.h).toFixed(4)})`;
    };
    const clearTransforms = () => {
      card.style.transform = "";
      cover.style.transform = "";
    };

    const loop = () => {
      const e = CARD.ease;
      cur.rx += (tgt.rx - cur.rx) * e;
      cur.ry += (tgt.ry - cur.ry) * e;
      cur.px += (tgt.px - cur.px) * e;
      cur.py += (tgt.py - cur.py) * e;
      cur.h += (tgt.h - cur.h) * e;
      apply();
      const atRest =
        !hovering &&
        Math.abs(cur.rx) < CARD.settleEps &&
        Math.abs(cur.ry) < CARD.settleEps &&
        Math.abs(cur.px) < CARD.settleEps &&
        Math.abs(cur.py) < CARD.settleEps &&
        cur.h < 0.002;
      if (atRest) {
        cur.rx = cur.ry = cur.px = cur.py = cur.h = 0;
        clearTransforms(); // settle EXACTLY to the original CSS state
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    const ensure = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };

    const onEnter = () => {
      hovering = true;
      tgt.h = 1;
      // Single reflection sweep — restart on each fresh hover (remove → reflow →
      // set) so it plays once per enter and never loops. No React re-render.
      card.removeAttribute("data-shine");
      void card.offsetWidth;
      card.setAttribute("data-shine", "1");
      ensure();
    };
    const onMove = (ev: PointerEvent) => {
      const r = root.getBoundingClientRect(); // untransformed → no feedback loop
      if (r.width === 0 || r.height === 0) return;
      let nx = (ev.clientX - (r.left + r.width / 2)) / (r.width / 2);
      let ny = (ev.clientY - (r.top + r.height / 2)) / (r.height / 2);
      nx = Math.max(-1, Math.min(1, nx));
      ny = Math.max(-1, Math.min(1, ny));
      tgt.ry = nx * CARD.maxTiltDeg;
      tgt.rx = -ny * CARD.maxTiltDeg;
      tgt.px = -nx * CARD.parallaxPx; // image crop moves OPPOSITE for depth
      tgt.py = -ny * CARD.parallaxPx;
      ensure();
    };
    const onLeave = () => {
      hovering = false;
      tgt.rx = tgt.ry = tgt.px = tgt.py = 0;
      tgt.h = 0;
      card.removeAttribute("data-shine");
      ensure();
    };

    root.addEventListener("pointerenter", onEnter);
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerleave", onLeave);
    return () => {
      root.removeEventListener("pointerenter", onEnter);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
      clearTransforms();
      card.removeAttribute("data-shine");
    };
  }, []);

  return (
    <section ref={rootRef} className={styles.release} aria-label="Upcoming release">
      {isHome && <span className={styles.rightGradient} aria-hidden="true" />}

      <div ref={cardRef} className={styles.card}>
        <div className={styles.releaseTop}>
          <span className={styles.divider} aria-hidden="true" />
          <div className={styles.releaseCopy}>
            <span className={styles.comingSoon}>COMING SOON</span>
            {/* Present in the DOM at rest, revealed on hover with no layout jump */}
            <div className={styles.releaseDetails}>
              <div className={styles.releaseDetailsInner}>
                {DETAILS.map((line, i) => (
                  <span
                    key={line}
                    className={styles.value}
                    style={
                      {
                        ["--reveal-delay"]: `${i * CARD.revealStaggerMs}ms`,
                      } as React.CSSProperties
                    }
                  >
                    {line}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className={styles.coverWrap}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={coverRef}
            className={styles.cover}
            src="/assets/images/release-cover.png"
            alt="2H2H001 — Marcos Baiano, Back to the Future EP (+ Terence :Terry: remix) cover artwork"
            width={220}
            height={220}
          />
        </div>

        <span className={styles.shine} aria-hidden="true" />
      </div>
    </section>
  );
}
