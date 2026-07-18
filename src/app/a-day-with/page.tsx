import styles from "./a-day-with.module.css";

const INTRO =
  "A journey into the lives of the DJs shaping today’s underground scene. Beyond the booth, we discover their stories, inspirations and everyday rituals. One artist. One day. No filters.";

export default function ADayWithPage() {
  return (
    <main className={styles.content}>
      <h1 className={styles.title}>A DAY WITH</h1>

      <div className={styles.block}>
        <p className={styles.intro}>{INTRO}</p>

        <div className={styles.cards}>
          {/* Episode 001 — whole card is the link */}
          <a
            className={styles.card}
            href="https://www.youtube.com/watch?v=YGRvNsLY0Ag"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Watch A Day with Terence :Terry: — Episode 001 on YouTube"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.cardImg}
              src="/assets/a-day-with/episode001.png"
              alt="A Day with Terence :Terry: — Episode 001"
              width={267}
              height={150}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.playIcon}
              src="/assets/icons/youtube-play.svg"
              alt=""
              aria-hidden="true"
              width={64}
              height={64}
            />
          </a>

          {/* Episode 002 — placeholder, not interactive */}
          <div className={styles.placeholder}>
            <div className={styles.placeholderText}>
              <span className={styles.value}>EPISODE 002</span>
              <span className={styles.value}>JOVONN</span>
              <span className={styles.muted}>COMING SOON</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
