import type { Metadata } from "next";
import CapsuleLanding from "@/components/capsule/CapsuleLanding";

export const metadata: Metadata = {
  title: "CAPSULE 22 · 2HOT2HANDLE",
  description: "CAPSULE - 22 ORIGINS — enter the 2HOT2HANDLE MENS or WOMENS capsule.",
};

/**
 * /capsule — the CAPSULE landing hub: two big image links (MENS / WOMENS) with a
 * central marquee. Rendered outside the shared music/WebGL shell and with audio
 * locked (isCapsuleRoute). The old direct-to-MENS behaviour now lives at
 * /capsule/mens.
 */
export default function CapsulePage() {
  return <CapsuleLanding />;
}
