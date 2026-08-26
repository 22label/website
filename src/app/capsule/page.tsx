import type { Metadata } from "next";
import CapsuleHub from "@/components/capsule/CapsuleHub";

export const metadata: Metadata = {
  title: "CAPSULE 22 — MENS · 2HOT2HANDLE",
  description:
    "CAPSULE - 22 ORIGINS — the 2HOT2HANDLE MENS capsule collection.",
};

/**
 * /capsule — the CAPSULE 22 MENS hub. Rendered outside the shared music/WebGL
 * shell (Shell.tsx returns children bare for this route) and with audio locked at
 * the AudioProvider level, so this is a fully isolated fashion environment.
 */
export default function CapsulePage() {
  return <CapsuleHub />;
}
