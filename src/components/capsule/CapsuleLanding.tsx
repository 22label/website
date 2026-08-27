"use client";

import Link from "next/link";
import { CAPSULE_LANDING } from "@/data/capsule";
import { useCapsuleCart } from "./CapsuleCartContext";
import CapsuleHeader from "./CapsuleHeader";
import CapsuleMarquee from "./CapsuleMarquee";
import HubCursor from "./HubCursor";
import styles from "./capsule.module.css";

/**
 * CAPSULE landing hub (Figma 285-2079 desktop / 285-1883 mobile). Two big image
 * links — MENS + WOMENS — with the central marquee overlaid. Desktop: side by
 * side, each half a full-width text cursor ([VIEW MENS] / [VIEW WOMENS]). Mobile:
 * stacked vertically (MENS, marquee, WOMENS), whole image tappable, no cursor.
 * Header has no menu here (the images ARE the audience chooser). Music-free.
 */
export default function CapsuleLanding() {
  const { drawerOpen } = useCapsuleCart();
  const { mens, womens, marqueeText } = CAPSULE_LANDING;

  return (
    <div className={styles.landingPage} data-drawer-open={drawerOpen ? "" : undefined}>
      <CapsuleHeader />

      <main className={styles.landingMain}>
        {[mens, womens].map((side) => (
          <Link
            key={side.href}
            className={styles.landingSide}
            href={side.href}
            aria-label={side.label}
            data-hub-cursor-zone=""
            data-cursor-label={side.cursor}
            draggable={false}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.landingImg}
              src={side.image}
              alt={side.alt}
              draggable={false}
            />
          </Link>
        ))}

        <CapsuleMarquee text={marqueeText} />
      </main>

      <HubCursor disabled={drawerOpen} />
    </div>
  );
}
