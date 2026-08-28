"use client";

import { useCapsuleCart } from "./CapsuleCartContext";
import styles from "./capsule.module.css";

/**
 * Desktop CART trigger — extracted so it (and only it) consumes the cart context.
 * The header can therefore render WITHOUT a cart provider in its "comingSoon"
 * variant (the teaser has no cart). Pinned top-right + right-anchored via `.cart`
 * (see capsule.module.css); hidden on mobile, where the burger menu takes over.
 */
export default function CapsuleCartButton() {
  const { count, drawerOpen, toggleDrawer, cartButtonRef } = useCapsuleCart();
  return (
    <div className={styles.cart} data-hidden={drawerOpen ? "" : undefined}>
      <button
        ref={cartButtonRef}
        type="button"
        className={styles.cartButton}
        aria-haspopup="dialog"
        aria-expanded={drawerOpen}
        aria-label={`Open cart, ${count} item${count === 1 ? "" : "s"}`}
        onClick={toggleDrawer}
      >
        CART <span aria-live="polite">({count})</span>
      </button>
    </div>
  );
}
