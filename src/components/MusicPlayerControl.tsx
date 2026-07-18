"use client";

import { useAudio } from "./AudioProvider";
import styles from "./MusicPlayer.module.css";

/**
 * Music-player control UI (desktop + mobile variants). Purely presentational:
 * play/pause state and the toggle come from the single global AudioProvider, so
 * every instance (desktop rail, Home mobile) drives the same <audio> — no local
 * audio element, no duplicate playback, state always in sync with the audio.
 *
 * OFF: sound-off icon + "PLAY" + 73px line. ON: sound-on icon + marquee title +
 * full line (151px desktop / 113px mobile). The line is a graphic, not a
 * progress bar. PLAY and the title crossfade in the same slot (no overlap).
 */
const TITLE = "MARCOS BAIANO - INTRUDER (ORIGINAL MIX)";

export default function MusicPlayerControl({
  variant,
}: {
  variant: "desktop" | "mobile";
}) {
  const { playing, toggle } = useAudio();

  return (
    <div
      className={`${styles.control} ${
        variant === "mobile" ? styles.mobile : styles.desktop
      }`}
    >
      <button
        type="button"
        className={styles.toggle}
        data-state={playing ? "on" : "off"}
        aria-pressed={playing}
        aria-label={playing ? "Pause music" : "Play music"}
        onClick={toggle}
      >
        <span className={styles.row}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.icon}
            src={
              playing
                ? "/assets/icons/volume-on.svg"
                : "/assets/icons/volume-off.svg"
            }
            alt=""
            aria-hidden="true"
            width={16}
            height={16}
          />
          {/* One slot holds PLAY (OFF) and the marquee title (ON); they
              crossfade in place so they never overlap and never shift. */}
          <span className={styles.labelSlot}>
            <span className={styles.playLabel}>PLAY</span>
            <span className={styles.titleClip}>
              <span className={styles.marquee}>
                <span className={styles.titleText}>{TITLE}</span>
                <span className={styles.titleText} aria-hidden="true">
                  {TITLE}
                </span>
              </span>
            </span>
          </span>
        </span>
        <span className={styles.line} aria-hidden="true" />
      </button>
    </div>
  );
}
