import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import CapsuleCartProvider from "@/components/capsule/CapsuleCartContext";

/**
 * Route-group layout for /capsule and /capsule/[productSlug]. The cart provider
 * lives here so the cart + drawer persist across client navigation between the hub
 * and every single-product page (shared, never reset). This layout adds no chrome:
 * /capsule* already renders outside the shared music/WebGL shell (see Shell.tsx +
 * isCapsuleRoute), so the whole section stays a fully isolated fashion environment.
 *
 * PRODUCTION GATE: the shop hub is still WIP, so the whole /capsule* section is
 * HIDDEN on production deploys — only the public teaser at /capsule-coming-soon (a
 * separate route, NOT under this layout) ships live. It stays fully accessible on
 * Preview deploys and in local dev/build for review. `VERCEL_ENV` is "production"
 * only on production builds; unset locally and "preview" on preview deploys.
 */
export default function CapsuleLayout({ children }: { children: ReactNode }) {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <CapsuleCartProvider>{children}</CapsuleCartProvider>;
}
