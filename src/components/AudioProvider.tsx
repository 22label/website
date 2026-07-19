"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { initAudioGraph, resumeAudio, setPlaying } from "@/effects/audioReactive";

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
  const [playing, setLocalPlaying] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.6;
    const onPlay = () => {
      setLocalPlaying(true);
      setPlaying(true); // Sonic Pulse envelope in
    };
    const onPause = () => {
      setLocalPlaying(false);
      setPlaying(false); // Sonic Pulse envelope out
    };
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    // The Web Audio graph (AudioContext + MediaElementSource + Analyser) can
    // only be built after a real user gesture on Safari, and building it before
    // the context can run would route playback through a suspended context and
    // mute it. So build + resume it on the FIRST user gesture; it is a no-op if
    // Sonic Pulse never runs. Self-removing + module-guarded (Strict Mode safe).
    const onFirstGesture = () => {
      initAudioGraph(audio);
      resumeAudio();
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
      window.removeEventListener("touchstart", onFirstGesture);
    };
    window.addEventListener("pointerdown", onFirstGesture, { passive: true });
    window.addEventListener("keydown", onFirstGesture);
    window.addEventListener("touchstart", onFirstGesture, { passive: true });

    // Attempt autoplay ON once at load. Real "play" event flips to ON; a
    // blocked autoplay is caught and we stay genuinely OFF (no fake ON).
    audio.play().catch(() => setLocalPlaying(false));
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
      window.removeEventListener("touchstart", onFirstGesture);
      audio.pause();
    };
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    // A toggle is a valid gesture: make sure the analyser graph exists + runs.
    initAudioGraph(audio);
    resumeAudio();
    // Resume from the current timestamp (no reset); handle autoplay refusal.
    if (audio.paused) audio.play().catch(() => setLocalPlaying(false));
    else audio.pause();
  }, []);

  return (
    <AudioContext.Provider value={{ playing, toggle }}>
      <audio ref={audioRef} src={AUDIO_SRC} loop preload="metadata" />
      {children}
    </AudioContext.Provider>
  );
}
