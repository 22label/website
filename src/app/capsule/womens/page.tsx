import type { Metadata } from "next";
import CapsuleCollection from "@/components/capsule/CapsuleCollection";

export const metadata: Metadata = {
  title: "CAPSULE 22 — WOMENS · 2HOT2HANDLE",
  description: "CAPSULE - 22 ORIGINS — the 2HOT2HANDLE WOMENS capsule collection.",
};

/** /capsule/womens — the WOMENS collection grid (isolated fashion environment). */
export default function CapsuleWomensPage() {
  return <CapsuleCollection gender="womens" />;
}
