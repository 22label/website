import { PLATFORMS, releases } from "@/data/releases";
import PortalMain from "@/components/PortalMain";
import styles from "./releases.module.css";

export default function ReleasesPage() {
  return (
    <PortalMain className={styles.content}>
      <h1 className={styles.title}>RELEASES</h1>

      <ul
        className={styles.rail}
        tabIndex={0}
        aria-label="Releases"
      >
        {releases.map((r) => (
          <li key={r.id} className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.divider} aria-hidden="true" />
              <div className={styles.copy}>
                <span className={styles.comingSoon}>COMING SOON</span>
                <span className={styles.value}>{r.catalog}</span>
                {r.lines.map((line) => (
                  <span key={line} className={styles.value}>
                    {line}
                  </span>
                ))}
              </div>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.cover}
              src={r.cover}
              alt={r.coverAlt}
              width={228}
              height={228}
            />

            <div className={styles.platforms}>
              {PLATFORMS.map((p) => {
                const href = p.key === "soundcloud" ? r.soundcloud : undefined;
                const iconStyle = {
                  ["--icon" as string]: `url(${p.icon})`,
                } as React.CSSProperties;
                if (href) {
                  return (
                    <a
                      key={p.key}
                      className={styles.platformBtn}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${r.catalog} on ${p.label}`}
                    >
                      <span
                        className={styles.platformIcon}
                        style={iconStyle}
                        aria-hidden="true"
                      />
                    </a>
                  );
                }
                return (
                  <span
                    key={p.key}
                    className={`${styles.platformBtn} ${styles.platformDisabled}`}
                    aria-disabled="true"
                    aria-label={`${p.label} — coming soon`}
                  >
                    <span
                      className={styles.platformIcon}
                      style={iconStyle}
                      aria-hidden="true"
                    />
                  </span>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </PortalMain>
  );
}
