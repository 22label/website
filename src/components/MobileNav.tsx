"use client";

import Link from "next/link";
import KineticLogo from "@/components/KineticLogo";
import MobileMenu from "@/components/MobileMenu";
import styles from "./MobileNav.module.css";

/**
 * Music mobile header: the logo (→ Home) + the shared burger MENU in its DARK theme.
 * The menu items, overlay and all behaviour (open/close, focus trap, scroll lock,
 * Escape, route-close) live in MobileMenu — this file is only the Music header shell.
 * Rendered on every route; CSS hides it on desktop (>=768px).
 */
export default function MobileNav() {
  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <Link className={styles.logoLink} href="/" aria-label="2HOT2HANDLE — Home">
          <KineticLogo>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.logo}
              src="/assets/svg/logo.svg"
              alt="2HOT2HANDLE"
              width={183}
              height={16}
            />
          </KineticLogo>
        </Link>

        <MobileMenu theme="dark" />
      </header>
    </div>
  );
}
