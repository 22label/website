"use client";

import { useEffect, useRef } from "react";
import styles from "./capsule.module.css";

/**
 * Text cursor shown only while a mouse is over a marked image link. Desktop
 * fine-pointer only; a pure visual enhancement over the real, keyboard-accessible
 * link. The label comes from the zone's `data-cursor-label` (e.g. "[VIEW MENS]" on
 * the landing, "[OPEN]" on collection cards), defaulting to "[OPEN]".
 *
 * - Self-detects the hovered zone via `[data-hub-cursor-zone]`, so it never appears
 *   over the colour/size selectors, + ADD, or the cart drawer.
 * - Hides the NATIVE cursor only on the zone currently hovered (set imperatively,
 *   so with JS disabled the native cursor is untouched and the link still works).
 * - Follows the pointer directly (no trail/scale/bounce) and updates via refs, so
 *   there is no React re-render per mouse move.
 * - Hidden while the drawer is open (`disabled`), on window blur, and on unmount.
 * Offset: the label is centred on the pointer (Figma gives no explicit offset).
 */
export default function HubCursor({ disabled }: { disabled: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const zoneRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const fine = window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
    if (!fine) return;
    const el = ref.current;
    if (!el) return;

    const hide = () => {
      el.style.opacity = "0";
      if (zoneRef.current) {
        zoneRef.current.style.cursor = "";
        zoneRef.current = null;
      }
    };

    const onMove = (e: MouseEvent) => {
      if (disabled) {
        hide();
        return;
      }
      const target = e.target as Element | null;
      const zone = target?.closest?.(
        "[data-hub-cursor-zone]",
      ) as HTMLElement | null;
      if (!zone) {
        hide();
        return;
      }
      if (zoneRef.current !== zone) {
        if (zoneRef.current) zoneRef.current.style.cursor = "";
        zone.style.cursor = "none";
        zoneRef.current = zone;
        el.textContent = zone.getAttribute("data-cursor-label") || "[OPEN]";
      }
      el.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
      el.style.opacity = "1";
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseleave", hide);
    window.addEventListener("blur", hide);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", hide);
      window.removeEventListener("blur", hide);
      hide();
    };
  }, [disabled]);

  return <div ref={ref} className={styles.cursor} aria-hidden="true" />;
}
