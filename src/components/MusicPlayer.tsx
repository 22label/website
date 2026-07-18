"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "./MusicPlayer.module.css";

/**
 * Home-desktop-only music player (node 212:500).
 *
 * - Mounts ONLY at the desktop breakpoint (>=768px); on mobile it renders
 *   nothing, so the <audio> element never exists and the MP3 is never fetched.
 * - Anchored at left:64px and positioned exactly 64px above the REAL top edge
 *   of the bottom-left "Studio information" block (measured, not a fragile
 *   hard-coded bottom), so the two share one vertical rail with a 64px gap.
 * - Autoplay-safe: starts OFF; audio only plays after an explicit click.
 * - The graphic state is always driven by the audio's real play/pause events.
 */
const AUDIO_SRC = "/audio/intruder-snippet.mp3";
const TITLE = "MARCOS BAIANO - INTRUDER (ORIGINAL MIX)";
const GAP_ABOVE = 64; // px above the bottom-left block
const FALLBACK_BOTTOM = 191; // 64 (info bottom) + ~63 (info height) + 64 gap

export default function MusicPlayer() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Never mount the audio pipeline off-desktop.
  return isDesktop ? <MusicPlayerDock /> : null;
}

function MusicPlayerDock() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [bottom, setBottom] = useState(FALLBACK_BOTTOM);

  // Audio: fixed 60% volume, looping snippet, state mirrored from real events,
  // and fully torn down on unmount (e.g. shrinking to mobile).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.6;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    // Try to start ON at 60% right away. If the browser allows autoplay the
    // real "play" event flips the graphic to ON; if it blocks autoplay the
    // rejection is caught and we stay genuinely OFF (never a faked ON, never
    // muted/zero-volume). The first user click then starts it normally.
    audio.play().catch(() => setPlaying(false));
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    };
  }, []);

  // Position 64px above the real top edge of the bottom-left block. Re-measured
  // on resize and after fonts load so the gap is exact at any size.
  useLayoutEffect(() => {
    const selector = 'section[aria-label="Studio information"]';
    const measure = () => {
      const el = Array.from(
        document.querySelectorAll<HTMLElement>(selector),
      ).find((c) => c.getBoundingClientRect().height > 0);
      if (!el) return;
      const r = el.getBoundingClientRect();
      setBottom(Math.round(window.innerHeight - r.top + GAP_ABOVE));
    };
    measure();
    const ro = new ResizeObserver(measure);
    document
      .querySelectorAll<HTMLElement>(selector)
      .forEach((c) => ro.observe(c));
    window.addEventListener("resize", measure);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      // Resumes from the current timestamp (no reset); handle autoplay refusal.
      audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  };

  return (
    <div className={styles.dock} style={{ bottom }}>
      <audio ref={audioRef} src={AUDIO_SRC} loop preload="metadata" />
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
          <span className={styles.titleClip}>
            <span className={styles.marquee}>
              <span className={styles.titleText}>{TITLE}</span>
              <span className={styles.titleText} aria-hidden="true">
                {TITLE}
              </span>
            </span>
          </span>
        </span>
        <span className={styles.line} aria-hidden="true" />
      </button>
    </div>
  );
}
