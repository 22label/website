import type { Metadata } from "next";
import CapsuleLandingView from "@/components/capsule/CapsuleLandingView";

export const metadata: Metadata = {
  title: "CAPSULE — Coming Soon · 2HOT2HANDLE",
  description:
    "CAPSULE - 22 ORIGINS — the 2HOT2HANDLE fashion capsule is coming soon.",
};

/**
 * /capsule-coming-soon — the PUBLIC teaser reachable from the music menu (same tab).
 * Deliberately a separate route from the WIP shop hub at /capsule: it never links
 * into /capsule/mens|womens or any product page. Rendered outside the shared music/
 * WebGL shell and audio-suppressed (isCapsuleRoute covers /capsule-coming-soon). It
 * needs no cart provider — the teaser has no cart and consumes no cart context.
 */
export default function CapsuleComingSoonPage() {
  return <CapsuleLandingView mode="comingSoon" />;
}
