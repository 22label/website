"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { setHpAmount, setLpAmount } from "@/effects/audioReactive";
import { useAudio } from "./AudioProvider";
import styles from "./Mixer.module.css";

/**
 * Interactive audio-filter MIXER (desktop only). Two mixer knobs — HP (high-pass)
 * and LP (low-pass) — sweep real BiquadFilterNodes inserted into the shared audio
 * graph BEFORE the analyser, so the waveform reacts to the actual filtered audio.
 *
 * Knob model: a normalized 0..1 effect amount, mapped to a −120°..+120° arc
 * (clamped). HP neutral −120° (≈8 o'clock), LP neutral +120° (≈4 o'clock); both
 * neutral = inaudible. Each knob's Active (amount > tolerance) → green silhouette
 * glow, independent per knob. The CONTAINER's Active fill (black-50%) follows
 * MUSIC PLAYBACK — not the knob positions: it turns on the instant playback
 * starts and off when it stops, regardless of where the knobs sit.
 *
 * Interaction lifecycle (strict, no latching): pointerdown press-and-HOLD begins
 * control; while held, vertical drag OR wheel/trackpad scroll adjusts the value;
 * pointerup/cancel/lostpointercapture/window-blur/unmount ends it immediately and
 * releases pointer capture. Wheel is consumed (page scroll prevented) ONLY while
 * held; an unheld knob ignores the wheel and the page scrolls normally. A bare
 * click (no move/scroll) changes nothing and never enters a persistent mode.
 * Keyboard: role="slider" + arrows / Home (neutral) / End (max).
 */

const ACTIVE_EPS = 0.005;
const DRAG_SENS = 1 / 170; // px of vertical travel → amount (full sweep ≈170px)
const WHEEL_STEP = 0.04; // per wheel notch/trackpad tick
const KEY_STEP = 0.05;

// ----------------------------------------------------- Safari drag selection lock
// A knob drag uses pointer capture and deliberately does NOT preventDefault on
// pointerdown (so the knob still focuses for keyboard control). On Safari that lets
// the browser begin a native text selection elsewhere on the page while the pointer
// moves. While ANY knob drag is active we suppress selection document-wide, then
// restore the previous inline state on release. Ref-counted so two simultaneous
// drags (HP + LP via multitouch) can't unlock the document early, and idempotent
// per knob (pointerdown ignores extra pointers), so lock/unlock stay balanced.
let dragSelectionLocks = 0;
let prevUserSelect = "";
let prevWebkitUserSelect = "";
const blockSelectStart = (e: Event) => e.preventDefault();

function lockDocumentSelection(): void {
  if (typeof document === "undefined") return;
  if (dragSelectionLocks === 0) {
    const s = document.documentElement.style;
    prevUserSelect = s.getPropertyValue("user-select");
    prevWebkitUserSelect = s.getPropertyValue("-webkit-user-select");
    s.setProperty("user-select", "none");
    s.setProperty("-webkit-user-select", "none");
    // Belt-and-suspenders for Safari: veto any selection outright for the drag.
    document.addEventListener("selectstart", blockSelectStart);
  }
  dragSelectionLocks++;
}

function unlockDocumentSelection(): void {
  if (typeof document === "undefined" || dragSelectionLocks === 0) return;
  dragSelectionLocks--;
  if (dragSelectionLocks === 0) {
    const s = document.documentElement.style;
    if (prevUserSelect) s.setProperty("user-select", prevUserSelect);
    else s.removeProperty("user-select");
    if (prevWebkitUserSelect) s.setProperty("-webkit-user-select", prevWebkitUserSelect);
    else s.removeProperty("-webkit-user-select");
    document.removeEventListener("selectstart", blockSelectStart);
  }
}

type Kind = "hp" | "lp";

/** Amount → CSS rotation. HP: 0→−120°, 1→+120°. LP: 0→+120°, 1→−120°. */
function rotationFor(kind: Kind, amount: number): number {
  return kind === "hp" ? -120 + amount * 240 : 120 - amount * 240;
}

function Knob({
  kind,
  label,
  apply,
  locked,
  onLockedAttempt,
}: {
  kind: Kind;
  label: string;
  apply: (a: number) => void;
  /** While locked (playback off) input never changes the value; it only cues. */
  locked: boolean;
  /** Called on any locked-knob input attempt → the PLAY CTA flashes its Focus. */
  onLockedAttempt: () => void;
}) {
  const [amount, setAmount] = useState(0);
  const valueRef = useRef(0); // synchronous current value for event handlers
  const knobRef = useRef<HTMLDivElement>(null);
  const heldRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const lastYRef = useRef(0);
  const pendingRef = useRef(0); // latest drag target awaiting a frame-batched commit
  const rafRef = useRef(0); // active requestAnimationFrame id (0 = none)
  const mountedRef = useRef(true);

  // Input direction. HP engages by scrolling/dragging/arrowing UP; LP is the
  // mirror image of HP, so it engages DOWN (scroll/drag down or ArrowDown) and
  // returns to neutral UP. Only the gesture→delta sign flips — the 0..1 `amount`
  // and everything derived from it (rotation, filter value, active, aria) are
  // unchanged, so all stay perfectly in sync.
  const dir = kind === "hp" ? 1 : -1;

  const set = useCallback(
    (a: number) => {
      const c = a < 0 ? 0 : a > 1 ? 1 : a; // clamp 0..1
      valueRef.current = c;
      pendingRef.current = c; // keep the drag base in sync (wheel/keyboard/commit)
      setAmount(c);
      apply(c); // drive the real filter (smoothly automated in the audio layer)
    },
    [apply],
  );

  // Frame-batched drag commit. A drag can fire a BURST of pointermove events per
  // frame (especially in Firefox); committing each one issues a React render + an
  // audio update, and the knob's CSS transform transition re-interpolates on every
  // render → the rotation stutters. Instead the moves only accumulate `pendingRef`;
  // a single rAF then commits the LATEST value once per frame (one render, one audio
  // write). It uses the newest value, never an averaged/delayed one, so there is no
  // lag — the visual rotation and the filter value advance together, one per frame.
  const commitFrame = useCallback(() => {
    rafRef.current = 0;
    set(pendingRef.current);
  }, [set]);
  const scheduleFrame = useCallback(() => {
    if (rafRef.current) return; // one pending frame at a time (coalesce this frame)
    rafRef.current = requestAnimationFrame(commitFrame);
  }, [commitFrame]);

  // End the hold: idempotent, always releases pointer capture + clears state and
  // the document selection lock. Runs on pointerup/cancel/lostcapture/blur/unmount.
  const endHold = useCallback(() => {
    if (!heldRef.current) return;
    heldRef.current = false;
    const el = knobRef.current;
    const pid = pointerIdRef.current;
    pointerIdRef.current = null;
    // Flush any sub-frame movement that arrived after the last committed frame, then
    // drop the scheduled frame — so the knob ends exactly where the pointer left it.
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (mountedRef.current && pendingRef.current !== valueRef.current) {
      set(pendingRef.current);
    }
    if (el) {
      el.removeAttribute("data-dragging"); // restore the transform transition
      if (pid !== null) {
        try {
          el.releasePointerCapture(pid);
        } catch {
          /* already released */
        }
      }
    }
    unlockDocumentSelection(); // balances the lock taken in onPointerDown
  }, [set]);

  // Wheel: only while HELD → adjust + preventDefault (block page scroll). When not
  // held, pass through so the page scrolls normally. Native + non-passive so
  // preventDefault works.
  useEffect(() => {
    const el = knobRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!heldRef.current) return;
      e.preventDefault(); // consume the held wheel gesture (no page scroll)
      if (locked) {
        onLockedAttempt(); // locked: cue "press play", never change the value
        return;
      }
      // deltaY<0 is a scroll-UP gesture; `dir` maps it to +step (HP) or −step (LP).
      set(valueRef.current + dir * (e.deltaY < 0 ? WHEEL_STEP : -WHEEL_STEP));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [set, dir, locked, onLockedAttempt]);

  // Window blur (and unmount cleanup) must always clear the interaction state.
  useEffect(() => {
    const onBlur = () => endHold();
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("blur", onBlur);
      endHold();
    };
  }, [endHold]);

  // Declared LAST so its cleanup runs FIRST on unmount — flips mounted false before
  // the blur effect's endHold, so no state is committed after unmount.
  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (heldRef.current) return; // ignore extra pointers/buttons
    heldRef.current = true;
    pointerIdRef.current = e.pointerId;
    lastYRef.current = e.clientY;
    pendingRef.current = valueRef.current; // drag accumulates from the current value
    // Suppress the transform transition during the drag so the rotation follows the
    // pointer 1:1 (the ~70ms transition otherwise trails each frame's update); it is
    // restored in endHold, keeping the transition for discrete wheel/keyboard steps.
    e.currentTarget.setAttribute("data-dragging", "1");
    // Suppress page text selection for the whole drag (Safari) — released in
    // endHold on every termination path. Done here (not via preventDefault) so the
    // knob still focuses and keyboard control is preserved.
    lockDocumentSelection();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture unsupported — window listeners still track it */
    }
    // No preventDefault → the knob still focuses (keyboard control preserved).
    if (locked) onLockedAttempt(); // grabbing a locked knob only cues "press play"
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!heldRef.current || e.pointerId !== pointerIdRef.current) return;
    if (locked) {
      lastYRef.current = e.clientY;
      onLockedAttempt(); // no value change while locked
      return;
    }
    // Accumulate the delta across any coalesced sub-events (a single dispatch can
    // carry several moves) so fast drags aren't under-counted; clamp per step so a
    // knob pinned at a bound reverses instantly with no dead zone. Fall back to the
    // event's own clientY where getCoalescedEvents is unavailable (older browsers).
    const native = e.nativeEvent;
    const evs =
      typeof native.getCoalescedEvents === "function"
        ? native.getCoalescedEvents()
        : null;
    let target = pendingRef.current;
    if (evs && evs.length > 0) {
      for (let i = 0; i < evs.length; i++) {
        const y = evs[i].clientY;
        target += dir * (lastYRef.current - y) * DRAG_SENS;
        lastYRef.current = y;
        target = target < 0 ? 0 : target > 1 ? 1 : target;
      }
    } else {
      target += dir * (lastYRef.current - e.clientY) * DRAG_SENS;
      lastYRef.current = e.clientY;
      target = target < 0 ? 0 : target > 1 ? 1 : target;
    }
    if (target === pendingRef.current) return; // no net movement this event
    pendingRef.current = target;
    // `dir` mirrors LP: drag up increases HP but returns LP toward neutral. The
    // value is committed once per frame by scheduleFrame (no render per raw event).
    scheduleFrame();
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId === pointerIdRef.current) endHold();
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const k = e.key;
    const isAdjust =
      k === "ArrowUp" ||
      k === "ArrowDown" ||
      k === "ArrowLeft" ||
      k === "ArrowRight" ||
      k === "Home" ||
      k === "End";
    if (!isAdjust) return;
    e.preventDefault(); // consume the key either way (locked cue or real adjust)
    if (locked) {
      onLockedAttempt(); // locked: cue "press play", never change the value
      return;
    }
    // Up/Right = engage gesture on HP; `dir` mirrors it for LP (Down engages LP,
    // Up returns it toward neutral). Home = neutral, End = max — absolute for both.
    if (k === "ArrowUp" || k === "ArrowRight") set(valueRef.current + dir * KEY_STEP);
    else if (k === "ArrowDown" || k === "ArrowLeft") set(valueRef.current - dir * KEY_STEP);
    else if (k === "Home") set(0);
    else if (k === "End") set(1);
  };

  const active = amount > ACTIVE_EPS;
  const pct = Math.round(amount * 100);
  return (
    <div className={styles.filter}>
      {/* Label row: HP/LP text + a 6px LED indicator (Figma 243:793/806). The LED
          is the SOLE active-state cue — it illuminates blue while this knob is
          off-neutral and dims when it returns to neutral. Driven by the SAME
          `active` (amount > tolerance) as rotation / aria-valuenow, so they can
          never desynchronise. The knob artwork itself gets no active styling. */}
      <div className={styles.labelRow}>
        <span className={styles.label}>{label}</span>
        <span
          className={`${styles.indicator} ${active ? styles.indicatorOn : ""}`}
          aria-hidden="true"
        />
      </div>
      <div
        ref={knobRef}
        className={styles.knob}
        role="slider"
        tabIndex={0}
        aria-label={`${label} filter`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}%`}
        aria-disabled={locked || undefined}
        aria-describedby={locked ? LOCK_HINT_ID : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={endHold}
        onKeyDown={onKeyDown}
        onDragStart={(e) => e.preventDefault()} // no native drag-ghost from the knob
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.knobImg}
          src="/assets/icons/mixer-knob.png"
          alt=""
          draggable={false}
          style={{ transform: `rotate(${rotationFor(kind, amount).toFixed(2)}deg)` }}
        />
      </div>
    </div>
  );
}

const LOCK_HINT_ID = "mixer-lock-hint";

export default function Mixer({
  onLockedAttempt,
}: {
  /** Bubbles a locked-knob attempt up to the desktop rail (drives PLAY Focus). */
  onLockedAttempt: () => void;
}) {
  // Container Active follows the canonical playback state (AudioProvider) — the
  // same flag the PLAY MUSIC pill uses — so the mixer fills black-50% at the exact
  // moment playback starts and clears when it stops. Knob positions never gate it.
  // The SAME flag locks the knobs: no playback → knobs are locked (input cues only).
  const { playing } = useAudio();
  const locked = !playing;
  return (
    <div
      className={`${styles.mixer} ${playing ? styles.active : ""}`}
      aria-label="Audio filter mixer"
    >
      {/* Non-visible hint for assistive tech while the knobs are locked. */}
      <span id={LOCK_HINT_ID} className={styles.srOnly}>
        Start music playback to adjust the HP and LP filters.
      </span>
      <Knob
        kind="hp"
        label="HP"
        apply={setHpAmount}
        locked={locked}
        onLockedAttempt={onLockedAttempt}
      />
      <Knob
        kind="lp"
        label="LP"
        apply={setLpAmount}
        locked={locked}
        onLockedAttempt={onLockedAttempt}
      />
    </div>
  );
}
