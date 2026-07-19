"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  ensureAudio,
  requestPlay,
  subscribePlaying,
  togglePlayback,
  userGesture,
} from "@/effects/audioReactive";

/**
 * Global, persistent audio for the whole site. The playback engine lives in the
 * audioReactive module (ONE AudioContext + a sample-accurate gapless loop via an
 * AudioBufferSourceNode), so it survives client-side navigation with no restart,
 * gap or duplicate sound — routes never touch it. This provider is just the
 * React shell: it mirrors the engine's play state into `playing` and exposes the
 * ON/OFF toggle to the desktop rail + Home-mobile controls (one shared state).
 *
 * Volume is fixed (0.6, in the engine's GainNode). Autoplay is attempted once;
 * if the browser blocks it (Safari/iOS) the context stays suspended and playback
 * begins on the first valid user gesture. No <audio> element is used for
 * playback (the original MP3 is fetched + decoded once).
 */

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
  const [playing, setPlayingState] = useState(false);

  useEffect(() => {
    // Mirror the engine's real play state (never a fake ON).
    const unsub = subscribePlaying(setPlayingState);

    // Build the graph + start decoding the loop, and attempt autoplay. If the
    // browser blocks it, the context stays suspended and we start on the first
    // gesture. Self-removing, module-guarded (Strict Mode safe).
    ensureAudio();
    const onFirstGesture = () => {
      userGesture();
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
      window.removeEventListener("touchstart", onFirstGesture);
    };
    window.addEventListener("pointerdown", onFirstGesture, { passive: true });
    window.addEventListener("keydown", onFirstGesture);
    window.addEventListener("touchstart", onFirstGesture, { passive: true });
    requestPlay(); // autoplay intent (honoured now or on the first gesture)

    return () => {
      unsub();
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
      window.removeEventListener("touchstart", onFirstGesture);
    };
  }, []);

  const toggle = useCallback(() => {
    userGesture(); // a toggle is a valid gesture (resume the context)
    togglePlayback();
  }, []);

  return (
    <AudioContext.Provider value={{ playing, toggle }}>
      {children}
    </AudioContext.Provider>
  );
}
