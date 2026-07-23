import Nav from "@/components/Nav";
import MobileNav from "@/components/MobileNav";
import ReleasePreviewer from "@/components/ReleasePreviewer";
import DesktopRail from "@/components/DesktopRail";
import MobileBottom from "@/components/MobileBottom";
import EffectsDebugPanel from "@/components/EffectsDebugPanel";
import PersistentScene from "@/components/PersistentScene";
import HomeHeatCue from "@/components/HomeHeatCue";
import MarqueeScratch from "@/components/MarqueeScratch";
import LogoLink from "@/components/LogoLink";
import KineticLogo from "@/components/KineticLogo";
import styles from "./Shell.module.css";

/**
 * Shared page shell — a single no-scroll viewport plus the four corner blocks
 * that are identical on every route (logo, menu, information, release
 * previewer). Page content is rendered as {children} behind the corners.
 */
export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.viewport}>
      {/* Persistent WebGL scene (desktop: mounted across routes; mobile: Home
          only). Sits behind everything so the portal transition can dive it. */}
      <PersistentScene />

      {/* Cursor trail now lives inside the Monogram WebGL pass (desktop-only),
          stencil-masked to the real monogram silhouette. */}

      {/* Home-only: gates the scroll-driven audio Heat + the approved instruction
          label (heat engages only while music plays, using telemetry.heat). */}
      <HomeHeatCue />

      {/* Stage C (desktop + Home + ?transport=worklet): marquee horizontal-drag →
          signed AudioWorklet scratch rate + the [DRAG TO SCRATCH] label. Inert
          otherwise; never touches the WebGL marquee or the default transport. */}
      <MarqueeScratch />

      {children}

      {/* TOP-LEFT — logo (links Home, portal-aware) + subtitle */}
      <header className={styles.topLeft}>
        <LogoLink className={styles.logoLink}>
          <KineticLogo>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.logo}
              src="/assets/svg/logo.svg"
              alt="2HOT2HANDLE"
              width={274}
              height={24}
            />
          </KineticLogo>
        </LogoLink>
        <p className={styles.subtitle}>EST. 2026 / BCN [ES]</p>
      </header>

      {/* TOP-RIGHT — navigation + social */}
      <Nav />

      {/* BOTTOM-LEFT — animated studio info + persistent music player (desktop,
          all routes; renders nothing on mobile) */}
      <DesktopRail />

      {/* BOTTOM-RIGHT — release previewer (unchanged behaviour) */}
      <ReleasePreviewer />

      {/* MOBILE — global bottom section (player + animated info, all routes) */}
      <MobileBottom />

      {/* MOBILE — header + menu overlay (hidden on desktop) */}
      <MobileNav />

      {/* LOCALHOST-ONLY — effects inspector, shown only with ?debugEffects=1 */}
      <EffectsDebugPanel />
    </div>
  );
}
