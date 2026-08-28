"use client";

import Link from "next/link";
import type { CapsuleGender, CapsuleCategory, CapsuleCategoryTab } from "@/data/capsule";
import { collectionHref } from "@/data/capsule";
import MobileMenu from "@/components/MobileMenu";
import CapsuleCartButton from "./CapsuleCartButton";
import CapsuleMobileMenu from "./CapsuleMobileMenu";
import styles from "./capsule.module.css";

/**
 * Shared CAPSULE header, driven by a typed `variant` (not a pile of booleans):
 *
 *  - "shop" (default): the real WIP storefront. Logo → /capsule; the desktop CART
 *    trigger (top-right) and the mobile burger MENU are rendered (both consume the
 *    cart context via their own child components).
 *  - "comingSoon": the public teaser (/capsule-coming-soon). Logo → "/" (back to the
 *    music site, same tab); NO cart is rendered (the teaser frame has none — the shop
 *    header is not inherited), and the mobile burger is a decorative, inert icon to
 *    match the frame (no menu is designed for the teaser). Because this variant never
 *    mounts a cart-context consumer, the header works WITHOUT a cart provider.
 */
export default function CapsuleHeader({
  menu,
  variant = "shop",
}: {
  menu?: {
    activeGender: CapsuleGender;
    activeCategory: CapsuleCategory;
    tabs: CapsuleCategoryTab[];
  };
  variant?: "shop" | "comingSoon";
}) {
  const comingSoon = variant === "comingSoon";
  const logoHref = comingSoon ? "/" : "/capsule";
  const logoLabel = comingSoon
    ? "2HOT2HANDLE — Home"
    : "2HOT2HANDLE — Capsule home";

  const genders: { id: CapsuleGender; label: string }[] = [
    { id: "mens", label: "MENS" },
    { id: "womens", label: "WOMENS" },
  ];

  return (
    <header
      className={styles.topBar}
      data-no-menu={menu ? undefined : ""}
      data-variant={comingSoon ? "coming-soon" : undefined}
    >
      <Link className={styles.logoLink} href={logoHref} aria-label={logoLabel}>
        <span className={styles.logo} role="img" aria-label="2HOT2HANDLE" />
        <span className={styles.est}>EST. 2026 / BCN [ES]</span>
      </Link>

      {menu && (
        <div className={styles.menu}>
          <nav className={styles.menuRow} aria-label="Audience">
            {genders.map((g) => {
              const active = g.id === menu.activeGender;
              return (
                <Link
                  key={g.id}
                  href={collectionHref(g.id)}
                  className={active ? styles.navActive : styles.navInactive}
                  aria-current={active ? "page" : undefined}
                >
                  {g.label}
                </Link>
              );
            })}
          </nav>
          <nav className={styles.menuRowCategory} aria-label="Product categories">
            {menu.tabs.map((tab) => {
              const active = tab.id === menu.activeCategory;
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
                  href={collectionHref(menu.activeGender)}
                  className={cls}
                  aria-current={active ? "page" : undefined}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}

      {/* Desktop CART — shop only (teaser has no cart, does not inherit it). */}
      {!comingSoon && <CapsuleCartButton />}

      {/* Mobile right slot: the shop's functional burger (opens the cart) vs. the
          shared MUSIC menu in its LIGHT theme for the Coming Soon teaser (same items
          + links as the dark Music menu; Figma 291-776). The .mobileMenu wrapper hides
          it on desktop (the teaser desktop has no burger). */}
      {comingSoon ? (
        <div className={styles.mobileMenu}>
          <MobileMenu theme="light" />
        </div>
      ) : (
        <CapsuleMobileMenu />
      )}
    </header>
  );
}
