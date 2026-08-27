"use client";

import Link from "next/link";
import type { CapsuleGender, CapsuleCategory, CapsuleCategoryTab } from "@/data/capsule";
import { collectionHref } from "@/data/capsule";
import { useCapsuleCart } from "./CapsuleCartContext";
import styles from "./capsule.module.css";

/**
 * Shared CAPSULE header. Logo → the section landing (/capsule). An optional center
 * menu (collections + SPP) links to the explicit /capsule/mens and /capsule/womens
 * routes; the landing omits it. The cart trigger is one button that renders as
 * "CART (n)" on desktop and a burger on mobile (the mobile frames show a burger in
 * the header, and the cart drawer is the only designed overlay, so it opens that).
 * The center menu is desktop-only; on mobile collections a sticky bottom menu (see
 * StickyMenu) handles audience + category instead.
 */
export default function CapsuleHeader({
  menu,
}: {
  menu?: {
    activeGender: CapsuleGender;
    activeCategory: CapsuleCategory;
    tabs: CapsuleCategoryTab[];
  };
}) {
  const { count, drawerOpen, toggleDrawer, cartButtonRef } = useCapsuleCart();

  const genders: { id: CapsuleGender; label: string }[] = [
    { id: "mens", label: "MENS" },
    { id: "womens", label: "WOMENS" },
  ];

  return (
    <header className={styles.topBar} data-no-menu={menu ? undefined : ""}>
      <Link className={styles.logoLink} href="/capsule" aria-label="2HOT2HANDLE — Capsule home">
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

      <div className={styles.cart} data-hidden={drawerOpen ? "" : undefined}>
        <button
          ref={cartButtonRef}
          type="button"
          className={styles.cartButton}
          aria-haspopup="dialog"
          aria-expanded={drawerOpen}
          aria-label={`Open cart, ${count} item${count === 1 ? "" : "s"}`}
          onClick={toggleDrawer}
        >
          <span className={styles.cartText} aria-hidden="true">
            CART <span aria-live="polite">({count})</span>
          </span>
          <span className={styles.cartBurger} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
      </div>
    </header>
  );
}
