"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

/**
 * Global, persistent audio for the whole site. Mounted once in the shared
 * layout (wrapping Shell) so it survives client-side navigation: a single
 * <audio> element is created once and never recreated between routes, so the
 * music keeps playing from the same timestamp with no restart or gap.
 *
 * Both the desktop rail player and the Home-mobile player consume this one
 * context — there is exactly one <audio> element and one play/pause state for
 * the entire app (desktop and mobile share it; a breakpoint change only swaps
 * the visible control, never the audio). Volume is fixed at 0.6, looping, no
 * native controls. Autoplay is attempted once; a blocked autoplay stays OFF.
 */
const AUDIO_SRC = "/audio/intruder-snippet.mp3";

type AudioContextValue = { playing: boolean; toggle: () => void };

const AudioContext = createContext<AudioContextValue | null>(null);

export function useAudio(): AudioContextValue {
  const ctx = useContext(AudioContext);
  return ctx ?? { playing: false, toggle: () => {} };
}

export default function AudioProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.6;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    // Attempt autoplay ON once at load. Real "play" event flips to ON; a
    // blocked autoplay is caught and we stay genuinely OFF (no fake ON).
    audio.play().catch(() => setPlaying(false));
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.pause();
    };
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    // Resume from the current timestamp (no reset); handle autoplay refusal.
    if (audio.paused) audio.play().catch(() => setPlaying(false));
    else audio.pause();
  }, []);

  return (
    <AudioContext.Provider value={{ playing, toggle }}>
      <audio ref={audioRef} src={AUDIO_SRC} loop preload="metadata" />
      {children}
    </AudioContext.Provider>
  );
}
