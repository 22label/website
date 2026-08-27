"use client";

import { useEffect, useRef } from "react";
import styles from "./capsule.module.css";

/**
 * Product-page gallery (Figma node 282-780). A real horizontal-scroll viewport that
 * CLIPS its track (overflow: hidden) at its own left edge, so images can never
 * cross into or sit behind the left information region — no overlay masks, no
 * fragile z-index.
 *
 * Interaction:
 * - Wheel: vertical wheel over the viewport is converted to horizontal movement
 *   (down → forward). The listener is non-passive and scoped to the viewport; it
 *   preventDefaults only while the carousel can still move that way, so at a
 *   boundary the page keeps its normal behaviour (no scroll-chaining lock).
 *   deltaMode + the dominant axis (trackpad) are normalised.
 * - Touch: native horizontal drag/swipe (overflow-x: auto).
 * - Keyboard: the viewport is focusable and scrolls with the arrow keys natively.
 * Native scrolling also enforces the start/end limits for free. Respects
 * prefers-reduced-motion (movement is direct — no added animation to strip).
 */
export default function ProductCarousel({
  images,
}: {
  images: { src: string; alt: string }[];
}) {
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    // Desktop only: convert vertical wheel to horizontal. On touch there is no
    // wheel event — native horizontal swipe handles the gallery, so we don't even
    // attach the listener (nothing useless on mobile).
    if (!window.matchMedia?.("(pointer: fine)").matches) return;

    const onWheel = (e: WheelEvent) => {
      const dominant =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      let delta = dominant;
      if (e.deltaMode === 1) delta *= 16; // lines → px
      else if (e.deltaMode === 2) delta *= el.clientWidth; // pages → px

      const max = el.scrollWidth - el.clientWidth;
      const atStart = el.scrollLeft <= 0;
      const atEnd = el.scrollLeft >= max - 1;
      // Let the page scroll normally only when pushing past a boundary.
      if ((delta <= 0 && atStart) || (delta >= 0 && atEnd)) return;

      e.preventDefault();
      el.scrollLeft += delta;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div
      ref={viewportRef}
      className={styles.carouselViewport}
      role="region"
      aria-label="Product image gallery"
      tabIndex={0}
    >
      <div className={styles.carouselTrack}>
        {images.map((img, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${img.src}-${i}`}
            className={styles.carouselImg}
            src={img.src}
            alt={img.alt}
            width={427}
            height={570}
            draggable={false}
          />
        ))}
      </div>
    </div>
  );
}
