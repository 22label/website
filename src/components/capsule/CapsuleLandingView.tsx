"use client";

import Link from "next/link";
import { CAPSULE_LANDING, CAPSULE_COMING_SOON } from "@/data/capsule";
import CapsuleHeader from "./CapsuleHeader";
import CapsuleMarquee from "./CapsuleMarquee";
import HubCursor from "./HubCursor";
import styles from "./capsule.module.css";

/**
 * The two-image + marquee landing, shared by the real shop hub and the public
 * Coming Soon teaser through a typed `mode` (Figma 285-2079 shop / 289-952 teaser).
 * Everything visual is identical; the mode flips only the interaction contract:
 *
 *  - "shop": each image is a real <Link> to its collection with a [VIEW MENS/WOMENS]
 *    hover cursor; the header shows the CART.
 *  - "comingSoon": the images are NON-navigable — plain <div>s (no <a>, no button, no
 *    onClick, not focusable, no link semantics). A single [COMING SOON] hover cursor
 *    (desktop) / static label (mobile) is purely informative, and the header carries
 *    no cart. Reachable from the music site; never links into the WIP shop.
 *
 * Presentational only — it takes `drawerOpen` as a prop and consumes NO cart context,
 * so the teaser can render without a cart provider.
 */
export default function CapsuleLandingView({
  mode = "shop",
  drawerOpen = false,
}: {
  mode?: "shop" | "comingSoon";
  drawerOpen?: boolean;
}) {
  const comingSoon = mode === "comingSoon";
  const { mens, womens, marqueeText } = CAPSULE_LANDING;
  const sides = [mens, womens];

  return (
    <div className={styles.landingPage} data-drawer-open={drawerOpen ? "" : undefined}>
      <CapsuleHeader variant={comingSoon ? "comingSoon" : "shop"} />

      <main className={styles.landingMain}>
        {sides.map((side, i) => {
          const audience = i === 0 ? "mens" : "womens";
          const mensLayered = comingSoon && audience === "mens";
          // Coming Soon uses its OWN single asset (Figma 290-1288/1289) at both
          // breakpoints — a separate set from the shop, which keeps its distinct
          // desktop/mobile crops. <picture>+media downloads only the matching source
          // (no desktop→mobile flash); explicit dimensions reserve the box (no CLS);
          // object-fit:cover applies the per-breakpoint crop from the container.
          // MOBILE-ONLY exception: the MENS teaser swaps in a SQUARE base (Figma
          // 296-813) that is pixel-registered with the transparent cutout below, so
          // the two crop identically under object-fit:cover. Desktop keeps `mens`.
          const desktopSrc = comingSoon ? CAPSULE_COMING_SOON[audience] : side.image;
          const mobileSrc = mensLayered
            ? CAPSULE_COMING_SOON.mensMobileBase
            : comingSoon
              ? CAPSULE_COMING_SOON[audience]
              : side.imageMobile;
          const picture = (
            <picture>
              <source
                media="(max-width: 860px)"
                srcSet={mobileSrc}
                width={mensLayered ? 1200 : comingSoon ? 854 : 375}
                height={mensLayered ? 1200 : comingSoon ? 788 : 333}
              />
              <img
                className={styles.landingImg}
                src={desktopSrc}
                alt={comingSoon ? "2HOT2HANDLE Capsule — coming soon" : side.alt}
                width={854}
                height={788}
                draggable={false}
              />
            </picture>
          );
          return comingSoon ? (
            // Non-navigable image: NOT a link/button, not focusable, no onClick. The
            // cursor zone drives the desktop follow-cursor; on mobile a single static
            // [COMING SOON] label is centred on the WOMENS photo (its own wrapper is
            // the containing block).
            <div
              key={side.image}
              className={styles.landingSide}
              data-hub-cursor-zone=""
              data-cursor-label="[COMING SOON]"
            >
              {picture}
              {/* Transparent PNG cutout of the SAME model (Figma 296-820), layered
                  ABOVE the marquee so it appears to pass behind the body. MOBILE ONLY
                  (CSS hides it ≤860px→shown; desktop keeps the flat single image).
                  Pixel-registered with the square mobile base → object-fit:cover crops
                  both identically, so it aligns with no shift/scale mismatch. */}
              {mensLayered && (
                <img
                  className={styles.mensForeground}
                  src={CAPSULE_COMING_SOON.mensMobileCutout}
                  alt=""
                  aria-hidden="true"
                  width={1200}
                  height={1200}
                  draggable={false}
                />
              )}
              {audience === "womens" && (
                <span className={styles.comingSoonLabel} aria-hidden="true">
                  [COMING SOON]
                </span>
              )}
            </div>
          ) : (
            <Link
              key={side.href}
              className={styles.landingSide}
              href={side.href}
              aria-label={side.label}
              data-hub-cursor-zone=""
              data-cursor-label={side.cursor}
              draggable={false}
            >
              {picture}
            </Link>
          );
        })}

        {/* The marquee is a single animated track. On desktop it is centred across
            both images; on mobile it sits over the MENS photo (see CSS). The static
            [COMING SOON] is NOT part of it — it lives on the WOMENS photo above. */}
        <CapsuleMarquee text={marqueeText} />
      </main>

      <HubCursor disabled={drawerOpen} />
    </div>
  );
}
