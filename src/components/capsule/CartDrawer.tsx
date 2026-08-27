"use client";

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { formatPrice, formatEuro } from "@/data/capsule";
import {
  cartCount,
  cartTotal,
  lineKey,
  normalizeQty,
  SHIPPING_EUR,
} from "@/data/capsuleCart.mjs";
import styles from "./capsule.module.css";

/** Matches the CartLine shape emitted by the ledger (see capsuleCart.mjs). */
interface CartLine {
  productId: string;
  name: string;
  colorId: string;
  colorLabel: string;
  size: string;
  unitPrice: number;
  thumb: string;
  thumbAlt: string;
  qty: number;
}

/** The exact X glyph exported from Figma (node 278-921), inlined so it recolours
 *  with currentColor for a gentle hover. */
function RemoveGlyph() {
  return (
    <svg
      className={styles.removeGlyph}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M16.1406 16.8594L12.0156 12.7031L7.85938 16.8594C7.67188 17.0469 7.35938 17.0469 7.14063 16.8594C6.95313 16.6406 6.95313 16.3281 7.14063 16.1406L11.2969 11.9844L7.14063 7.85938C6.95313 7.67188 6.95313 7.35938 7.14063 7.14063C7.35938 6.95313 7.67188 6.95313 7.85938 7.14063L12.0156 11.2969L16.1406 7.14063C16.3281 6.95313 16.6406 6.95313 16.8594 7.14063C17.0469 7.35938 17.0469 7.67188 16.8594 7.85938L12.7031 11.9844L16.8594 16.1406C17.0469 16.3281 17.0469 16.6406 16.8594 16.8594C16.6406 17.0469 16.3281 17.0469 16.1406 16.8594Z" />
    </svg>
  );
}

/** 24×24 quantity field. Keeps a local draft while typing; commits valid integers
 *  live (so totals update immediately) and normalises to ≥1 on blur/Enter. Never
 *  removes the line — 0/blank collapses to 1 (removal is the X's job). */
function QtyInput({
  qty,
  label,
  onCommit,
}: {
  qty: number;
  label: string;
  onCommit: (qty: number) => void;
}) {
  const [draft, setDraft] = useState(String(qty));
  const [prevQty, setPrevQty] = useState(qty);
  // Sync the draft when the authoritative qty changes (React's documented
  // "adjust state during render" pattern — no effect, so no cascading renders).
  if (qty !== prevQty) {
    setPrevQty(qty);
    setDraft(String(qty));
  }

  const commit = () => {
    const n = normalizeQty(draft);
    setDraft(String(n));
    onCommit(n);
  };

  return (
    <input
      className={styles.qtyInput}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      aria-label={label}
      value={draft}
      onChange={(e) => {
        const v = e.target.value;
        if (!/^\d*$/.test(v)) return; // digits only
        setDraft(v);
        // Live-commit only genuine ≥1 integers; blank/0 wait for blur.
        if (v !== "" && Number(v) >= 1) onCommit(normalizeQty(v));
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

/**
 * CAPSULE cart drawer (node 278-667). Slides in from the right over a transparent
 * backdrop — the Figma panel is an 80%-white fill with a background blur, so ONLY
 * the panel is translucent; text and controls stay 100%.
 *
 * Enter/exit is pure CSS driven by the `data-open` attribute; when closed the whole
 * root is `inert` + pointer-events:none, so it can neither be focused nor intercept
 * clicks on the page beneath it. Modal dialog: focus moves to CLOSE on open, is
 * trapped while open, and returns to the CART trigger on close. Escape, the CLOSE
 * button and a backdrop click all close. Honors prefers-reduced-motion via CSS.
 *
 * Table (node 278-913): header Item / Qty. / Price, then rows of
 * [remove X] · name · size · colour  …  [qty field] · price, hairline separators,
 * shipping, total, and the PRE ORDER CTA (unwired — no checkout designed yet).
 */
export default function CartDrawer({
  open,
  onClose,
  lines,
  triggerRef,
  onRemove,
  onQty,
}: {
  open: boolean;
  onClose: () => void;
  lines: CartLine[];
  triggerRef: RefObject<HTMLButtonElement | null>;
  onRemove: (key: string) => void;
  onQty: (key: string, qty: number) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const count = cartCount(lines);
  const total = cartTotal(lines);

  // Focus move-in / trap / restore, Escape — active only while open.
  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    const trigger = triggerRef.current;
    closeRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      trigger?.focus(); // return focus to the CART trigger on close
    };
  }, [open, onClose, triggerRef]);

  return (
    <div
      className={styles.drawerRoot}
      data-open={open ? "" : undefined}
      inert={!open}
    >
      <div
        className={styles.drawerBackdrop}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        className={styles.drawerPanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="capsule-cart-heading"
        tabIndex={-1}
      >
        <button
          ref={closeRef}
          type="button"
          className={styles.drawerClose}
          onClick={onClose}
          aria-label="Close cart"
        >
          CLOSE
        </button>

        <div className={styles.drawerContent}>
          <p id="capsule-cart-heading" className={styles.drawerHeading}>
            YOUR CART <span className={styles.drawerCount}>({count})</span>
          </p>

          {lines.length === 0 ? (
            <p className={styles.drawerEmpty}>YOUR CART IS EMPTY</p>
          ) : (
            <div className={styles.drawerScroll}>
              <div className={styles.cartTable}>
                <div className={styles.cartHead}>
                  <span className={styles.cartHeadItem}>Item</span>
                  <div className={styles.cartHeadRight}>
                    <span className={styles.cartHeadQty}>Qty.</span>
                    <span className={styles.cartHeadPrice}>Price</span>
                  </div>
                </div>

                <div className={styles.cartItems}>
                  {lines.map((l) => {
                    const key = lineKey(l.productId, l.colorId, l.size);
                    const color = l.colorLabel.toUpperCase();
                    return (
                      <div key={key} className={styles.cartRow}>
                        <div className={styles.cartRowInner}>
                          <div className={styles.cartItemCol}>
                            <button
                              type="button"
                              className={styles.removeBtn}
                              onClick={() => onRemove(key)}
                              aria-label={`Remove ${l.name}, ${l.colorLabel}, size ${l.size}`}
                            >
                              <RemoveGlyph />
                            </button>
                            <span className={styles.cartName}>{l.name}</span>
                            <span className={styles.cartAttr}>{l.size}</span>
                            <span className={styles.cartAttr}>{color}</span>
                          </div>
                          <div className={styles.cartRight}>
                            <QtyInput
                              qty={l.qty}
                              label={`Quantity for ${l.name}, ${l.colorLabel}, size ${l.size}`}
                              onCommit={(q) => onQty(key, q)}
                            />
                            <span className={styles.cartPrice}>
                              {formatPrice(l.unitPrice)}
                            </span>
                          </div>
                        </div>
                        <span className={styles.drawerRule} aria-hidden="true" />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className={styles.drawerMetaRow}>
                <div className={styles.cartRowInner}>
                  <span className={styles.drawerShipLabel}>Shipping costs</span>
                  <span className={styles.cartPrice}>
                    {formatEuro(SHIPPING_EUR)}
                  </span>
                </div>
                <span className={styles.drawerRule} aria-hidden="true" />
              </div>

              <div className={styles.drawerMetaRow}>
                <div className={styles.cartRowInner}>
                  <span className={styles.drawerTotalLabel}>TOTAL</span>
                  <span className={styles.drawerTotalValue}>
                    {formatEuro(total)}
                  </span>
                </div>
                <span className={styles.drawerRule} aria-hidden="true" />
              </div>
            </div>
          )}

          <div className={styles.drawerFoot}>
            <button
              type="button"
              className={styles.preorder}
              disabled={lines.length === 0}
            >
              PRE ORDER
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
