"use client";

import { usePathname } from "next/navigation";
import styles from "./ReleasePreviewer.module.css";

/**
 * Bottom-right release previewer — unchanged behaviour, shared across routes.
 * Anchored bottom-right; grows up + left on hover.
 *
 * On the Home route (desktop) it also renders a right-edge protective gradient
 * that fades in with the same CSS hover/focus state that expands the player, so
 * the white release copy stays legible over the white marquee. The gradient is
 * a child of .release (reusing that hover state — no duplicate listeners),
 * pointer-events:none and aria-hidden, above the marquee but below the copy.
 */
export default function ReleasePreviewer() {
  const isHome = usePathname() === "/";

  return (
    <section className={styles.release} aria-label="Upcoming release">
      {isHome && <span className={styles.rightGradient} aria-hidden="true" />}

      <div className={styles.releaseTop}>
        <span className={styles.divider} aria-hidden="true" />
        <div className={styles.releaseCopy}>
          <span className={styles.comingSoon}>COMING SOON</span>
          {/* Present in the DOM at rest, revealed on hover with no layout jump */}
          <div className={styles.releaseDetails}>
            <div className={styles.releaseDetailsInner}>
              <span className={styles.value}>2H2H001</span>
              <span className={styles.value}>MARCOS BAIANO</span>
              <span className={styles.value}>BACK TO THE FUTURE EP</span>
              <span className={styles.value}>+TERENCE :TERRY: REMIX</span>
            </div>
          </div>
        </div>
      </div>
      <div className={styles.coverWrap}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.cover}
          src="/assets/images/release-cover.png"
          alt="2H2H001 — Marcos Baiano, Back to the Future EP (+ Terence :Terry: remix) cover artwork"
          width={220}
          height={220}
        />
        <span className={styles.coverLabel} aria-hidden="true">
          <span className={styles.coverLabelPill}>COMING SOON</span>
        </span>
      </div>
    </section>
  );
}
