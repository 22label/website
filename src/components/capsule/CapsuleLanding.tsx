"use client";

import { useCapsuleCart } from "./CapsuleCartContext";
import CapsuleLandingView from "./CapsuleLandingView";

/**
 * CAPSULE shop landing hub (/capsule). Thin wrapper that reads the drawer state from
 * the cart context and renders the shared landing view in "shop" mode (navigable
 * images + CART). The presentational markup lives in CapsuleLandingView, shared with
 * the public Coming Soon teaser.
 */
export default function CapsuleLanding() {
  const { drawerOpen } = useCapsuleCart();
  return <CapsuleLandingView mode="shop" drawerOpen={drawerOpen} />;
}
