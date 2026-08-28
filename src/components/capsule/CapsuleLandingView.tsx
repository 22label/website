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
          // Coming Soon uses its OWN single asset (Figma 290-1288/1289) at both
          // breakpoints — a separate set from the shop, which keeps its distinct
          // desktop/mobile crops. <picture>+media downloads only the matching source
          // (no desktop→mobile flash); explicit dimensions reserve the box (no CLS);
          // object-fit:cover applies the per-breakpoint crop from the container.
          const desktopSrc = comingSoon ? CAPSULE_COMING_SOON[audience] : side.image;
          const mobileSrc = comingSoon ? CAPSULE_COMING_SOON[audience] : side.imageMobile;
          const picture = (
            <picture>
              <source
                media="(max-width: 860px)"
                srcSet={mobileSrc}
                width={comingSoon ? 854 : 375}
                height={comingSoon ? 788 : 333}
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
            // cursor zone only drives the informative [COMING SOON] label.
            <div
              key={side.image}
              className={styles.landingSide}
              data-hub-cursor-zone=""
              data-cursor-label="[COMING SOON]"
            >
              {picture}
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

        {/* Coming Soon: a STATIC [COMING SOON] label is overlaid on the marquee bar
            (centred), rendered by CapsuleMarquee OUTSIDE its animated track so only
            the repeated text moves. It shows on mobile (desktop uses the follow
            cursor); the label never joins the loop and never inherits its transform. */}
        <CapsuleMarquee
          text={marqueeText}
          overlayLabel={comingSoon ? "[COMING SOON]" : undefined}
        />
      </main>

      <HubCursor disabled={drawerOpen} />
    </div>
  );
}
