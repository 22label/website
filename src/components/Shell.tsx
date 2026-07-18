import Link from "next/link";
import Nav from "@/components/Nav";
import MobileNav from "@/components/MobileNav";
import ReleasePreviewer from "@/components/ReleasePreviewer";
import DesktopRail from "@/components/DesktopRail";
import styles from "./Shell.module.css";

/**
 * Shared page shell — a single no-scroll viewport plus the four corner blocks
 * that are identical on every route (logo, menu, information, release
 * previewer). Page content is rendered as {children} behind the corners.
 */
export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.viewport}>
      {children}

      {/* TOP-LEFT — logo (links Home) + subtitle */}
      <header className={styles.topLeft}>
        <Link
          className={styles.logoLink}
          href="/"
          aria-label="2HOT2HANDLE — Home"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.logo}
            src="/assets/svg/logo.svg"
            alt="2HOT2HANDLE"
            width={274}
            height={24}
          />
        </Link>
        <p className={styles.subtitle}>RAW MUSIC CULTURE</p>
      </header>

      {/* TOP-RIGHT — navigation + social */}
      <Nav />

      {/* BOTTOM-LEFT — animated studio info + persistent music player (desktop,
          all routes; renders nothing on mobile) */}
      <DesktopRail />

      {/* BOTTOM-RIGHT — release previewer (unchanged behaviour) */}
      <ReleasePreviewer />

      {/* MOBILE — header + menu overlay (hidden on desktop) */}
      <MobileNav />
    </div>
  );
}
