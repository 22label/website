"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { setHpAmount, setLpAmount } from "@/effects/audioReactive";
import styles from "./Mixer.module.css";

/**
 * Interactive audio-filter MIXER (desktop only). Two mixer knobs — HP (high-pass)
 * and LP (low-pass) — sweep real BiquadFilterNodes inserted into the shared audio
 * graph BEFORE the analyser, so the waveform reacts to the actual filtered audio.
 *
 * Knob model: a normalized 0..1 effect amount, mapped to a −120°..+120° arc
 * (240° travel, clamped — never wraps). HP neutral is −120° (≈8 o'clock, amount 0);
 * LP neutral is +120° (≈4 o'clock, amount 0). Increasing either amount pushes the
 * indicator toward the opposite side. Pointer drag up / wheel up increases; arrows
 * step; Home = neutral, End = max. Pointer capture keeps the knob grabbed off its
 * bounds. Active (amount > tolerance) → green silhouette glow.
 */

const ACTIVE_EPS = 0.005;
const DRAG_SENS = 1 / 170; // px of vertical drag → amount (full travel ≈170px)
const WHEEL_STEP = 0.04;
const KEY_STEP = 0.05;

type Kind = "hp" | "lp";

/** Amount → CSS rotation. HP: 0→−120°, 1→+120°. LP: 0→+120°, 1→−120°. */
function rotationFor(kind: Kind, amount: number): number {
  return kind === "hp" ? -120 + amount * 240 : 120 - amount * 240;
}

function Knob({
  kind,
  label,
  apply,
}: {
  kind: Kind;
  label: string;
  apply: (a: number) => void;
}) {
  const [amount, setAmount] = useState(0);
  const amountRef = useRef(0);
  useEffect(() => {
    amountRef.current = amount; // mirror for event handlers (read outside render)
  }, [amount]);
  const knobRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; startY: number; startAmount: number } | null>(
    null,
  );

  const set = useCallback(
    (a: number) => {
      const c = a < 0 ? 0 : a > 1 ? 1 : a; // clamp 0..1
      setAmount(c);
      apply(c); // drive the real filter (smoothly automated in the audio layer)
    },
    [apply],
  );

  // Native, non-passive wheel listener so scrolling over the knob adjusts it and
  // does NOT scroll the page (React's onWheel can't reliably preventDefault).
  useEffect(() => {
    const el = knobRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      set(amountRef.current + (e.deltaY < 0 ? WHEEL_STEP : -WHEEL_STEP));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [set]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      id: e.pointerId,
      startY: e.clientY,
      startAmount: amountRef.current,
    };
    e.preventDefault(); // no text selection / focus scroll
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    set(d.startAmount + (d.startY - e.clientY) * DRAG_SENS); // up = increase
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current && drag.current.id === e.pointerId) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      drag.current = null;
    }
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let handled = true;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") set(amountRef.current + KEY_STEP);
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") set(amountRef.current - KEY_STEP);
    else if (e.key === "Home") set(0);
    else if (e.key === "End") set(1);
    else handled = false;
    if (handled) e.preventDefault();
  };

  const active = amount > ACTIVE_EPS;
  const pct = Math.round(amount * 100);
  return (
    <div className={styles.filter}>
      <span className={styles.label}>{label}</span>
      <div
        ref={knobRef}
        className={`${styles.knob} ${active ? styles.active : ""}`}
        role="slider"
        tabIndex={0}
        aria-label={`${label} filter`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}%`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.knobImg}
          src="/assets/icons/mixer-knob.svg"
          alt=""
          draggable={false}
          style={{ transform: `rotate(${rotationFor(kind, amount).toFixed(2)}deg)` }}
        />
      </div>
    </div>
  );
}

export default function Mixer() {
  return (
    <div className={styles.mixer} aria-label="Audio filter mixer">
      <Knob kind="hp" label="HP" apply={setHpAmount} />
      <Knob kind="lp" label="LP" apply={setLpAmount} />
    </div>
  );
}
