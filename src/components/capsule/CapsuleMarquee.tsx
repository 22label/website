import styles from "./capsule.module.css";

/**
 * CAPSULE landing marquee (Figma 286-702) — a LOCAL, purely-visual component. It
 * has nothing to do with the site's music/heat marquee. Seamless loop via two
 * identical track halves translated by -50% (no perceived jump); pointer-events
 * are off so it never blocks the image links beneath it. A single visually-hidden
 * copy carries the text for screen readers; under prefers-reduced-motion the CSS
 * stops the animation and the text stays statically legible. Position is CSS-only:
 * desktop centres it across both images; mobile places it over the MENS photo.
 */
export default function CapsuleMarquee({ text }: { text: string }) {
  const REPEATS = 4; // one half must exceed the widest viewport → no empty gap
  const half = Array.from({ length: REPEATS });
  return (
    <div className={styles.marquee}>
      <span className={styles.srOnly}>{text}</span>
      <div className={styles.marqueeTrack} aria-hidden="true">
        {[0, 1].map((g) => (
          <div className={styles.marqueeGroup} key={g}>
            {half.map((_, i) => (
              <span className={styles.marqueeItem} key={i}>
                {text}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
