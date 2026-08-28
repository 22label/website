"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCapsuleCart } from "./CapsuleCartContext";
import styles from "./capsule.module.css";

const MENU_ID = "capsule-mobile-menu";

/**
 * Mobile CAPSULE header burger + menu (Figma 285-1899 header / 285-1912 icon). The
 * burger is a REAL <button> with a dynamic accessible name (Open menu / Close menu),
 * aria-expanded and aria-controls; the icon is the exact two-line glyph from the
 * component (32×32 box, lines at y10.5 / y20.5, 6.5→27.5, round caps), rendered as
 * inline SVG (currentColor) — no invented raster. The touch target is padded out to
 * ≥44px while a negative block margin keeps the header at its designed height.
 *
 * The full mobile navigation is NOT designed in Figma yet, so nothing is invented:
 * the panel exposes only the one real destination that exists in the Capsule section
 * — the CART (opens the shared drawer). It is flagged in the report as pending design.
 * Opening the panel is a modal overlay (no layout shift): body scroll lock, Escape to
 * close, a simple focus trap, and focus restored to the burger on close.
 */
export default function CapsuleMobileMenu() {
  const { count, openDrawer } = useCapsuleCart();
  const [open, setOpen] = useState(false);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const burger = burgerRef.current;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.querySelector<HTMLElement>("button")?.focus();

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      burger?.focus();
    };
  }, [open]);

  const openCart = () => {
    // Close the menu first (restores focus to the burger via the effect cleanup),
    // then open the drawer on the next tick so the drawer wins the final focus.
    setOpen(false);
    setTimeout(openDrawer, 0);
  };

  return (
    <div className={styles.mobileMenu}>
      <button
        ref={burgerRef}
        type="button"
        className={styles.burger}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls={MENU_ID}
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          className={styles.burgerIcon}
          viewBox="0 0 32 32"
          width="32"
          height="32"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          <line x1="6.5" y1="10.5" x2="27.5" y2="10.5" stroke="currentColor" strokeLinecap="round" />
          <line x1="6.5" y1="20.5" x2="27.5" y2="20.5" stroke="currentColor" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div
          id={MENU_ID}
          ref={panelRef}
          className={styles.mobileMenuPanel}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <button type="button" className={styles.mobileMenuClose} onClick={close} aria-label="Close menu">
            CLOSE
          </button>
          <div className={styles.mobileMenuBody}>
            <button type="button" className={styles.mobileMenuItem} onClick={openCart}>
              CART ({count})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
