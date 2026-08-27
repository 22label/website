import type { Metadata } from "next";
import CapsuleCollection from "@/components/capsule/CapsuleCollection";

export const metadata: Metadata = {
  title: "CAPSULE 22 — MENS · 2HOT2HANDLE",
  description: "CAPSULE - 22 ORIGINS — the 2HOT2HANDLE MENS capsule collection.",
};

/** /capsule/mens — the MENS collection grid (isolated fashion environment). */
export default function CapsuleMensPage() {
  return <CapsuleCollection gender="mens" />;
}
