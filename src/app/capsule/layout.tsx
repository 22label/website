import type { ReactNode } from "react";
import CapsuleCartProvider from "@/components/capsule/CapsuleCartContext";

/**
 * Route-group layout for /capsule and /capsule/[productSlug]. The cart provider
 * lives here so the cart + drawer persist across client navigation between the hub
 * and every single-product page (shared, never reset). This layout adds no chrome:
 * /capsule* already renders outside the shared music/WebGL shell (see Shell.tsx +
 * isCapsuleRoute), so the whole section stays a fully isolated fashion environment.
 */
export default function CapsuleLayout({ children }: { children: ReactNode }) {
  return <CapsuleCartProvider>{children}</CapsuleCartProvider>;
}
