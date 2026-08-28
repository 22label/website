import styles from "./capsule.module.css";

/**
 * CAPSULE landing marquee (Figma 286-702) — a LOCAL, purely-visual component. It
 * has nothing to do with the site's music/heat marquee. Seamless loop via two
 * identical track halves translated by -50% (no perceived jump); pointer-events
 * are off so it never blocks the image links beneath it. A single visually-hidden
 * copy carries the text for screen readers; under prefers-reduced-motion the CSS
 * stops the animation and the text stays statically legible.
 *
 * `overlayLabel` (Coming Soon teaser, Figma 289-1054): a STATIC label centred on the
 * marquee bar, rendered as a sibling OUTSIDE the animated `.marqueeTrack`. It is not
 * part of the loop (never duplicated), inherits none of the track's transform (never
 * vibrates/moves), and is pointer-events:none. CSS shows it on mobile only (desktop
 * uses the follow cursor); the underlying track keeps scrolling beneath it.
 */
export default function CapsuleMarquee({
  text,
  overlayLabel,
}: {
  text: string;
  overlayLabel?: string;
}) {
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
      {overlayLabel && (
        <span className={styles.marqueeOverlay} aria-hidden="true">
          {overlayLabel}
        </span>
      )}
    </div>
  );
}
