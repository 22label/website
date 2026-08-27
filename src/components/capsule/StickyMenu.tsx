"use client";

import Link from "next/link";
import type { CapsuleGender, CapsuleCategory, CapsuleCategoryTab } from "@/data/capsule";
import { collectionHref } from "@/data/capsule";
import styles from "./capsule.module.css";

/**
 * Mobile-only sticky bottom menu (Figma 285-1630), shown on the MENS/WOMENS
 * collection pages. Left: M / W audience switch (real links to the collection
 * routes, current one highlighted). Right: TEE (active) / HOODIE / CAP (disabled,
 * matching the frame — no invented COMING SOON pills). Fixed to the bottom with
 * env(safe-area-inset-bottom); the collection reserves matching bottom space so it
 * never covers the last card. Not rendered on desktop, the landing or the SPP.
 */
export default function StickyMenu({
  activeGender,
  activeCategory,
  tabs,
}: {
  activeGender: CapsuleGender;
  activeCategory: CapsuleCategory;
  tabs: CapsuleCategoryTab[];
}) {
  const genders: { id: CapsuleGender; label: string }[] = [
    { id: "mens", label: "M" },
    { id: "womens", label: "W" },
  ];

  return (
    <nav className={styles.sticky} aria-label="Capsule collection">
      <div className={styles.stickyMW}>
        {genders.map((g) => {
          const active = g.id === activeGender;
          return (
            <Link
              key={g.id}
              href={collectionHref(g.id)}
              className={active ? styles.mwActive : styles.mwInactive}
              aria-current={active ? "page" : undefined}
              aria-label={g.id === "mens" ? "MENS collection" : "WOMENS collection"}
            >
              {g.label}
            </Link>
          );
        })}
      </div>

      <div className={styles.stickyCats}>
        {tabs.map((tab) => {
          const active = tab.id === activeCategory;
          const disabled = !!tab.comingSoon;
          const cls = active ? styles.navActive : styles.navInactive;
          if (disabled) {
            return (
              <span key={tab.id} className={cls} aria-disabled="true" title="Coming soon">
                {tab.label}
              </span>
            );
          }
          return (
            <Link
              key={tab.id}
              href={collectionHref(activeGender)}
              className={cls}
              aria-current={active ? "page" : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
