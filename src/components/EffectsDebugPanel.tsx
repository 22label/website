"use client";

import { useEffect, useState } from "react";
import {
  EFFECTS,
  HEATMAP,
  PULSE,
  setHeatmapIntensity,
  setHeatmapMaxHeight,
  setHeatmapOpacity,
  setHeatmapSmoothing,
  setSonicIntensity,
  telemetry,
} from "@/effects/effectsConfig";
import styles from "./EffectsDebugPanel.module.css";

/**
 * LOCALHOST-ONLY effects inspector, shown ONLY when the URL has
 * `?debugEffects=1`. It samples the shared `telemetry` object on a slow (4Hz)
 * interval — never per frame, never drives visuals — and can toggle each
 * feature flag live. The container is pointer-events:none so it can't intercept
 * pointer/touch; only the two toggle buttons are interactive.
 */
export default function EffectsDebugPanel() {
  // Client-only, query-param gated reveal (avoids any SSR/hydration mismatch —
  // the server + first client render are both null, then the effect opts in).
  const [enabled, setEnabled] = useState(false);
  const [, force] = useState(0);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("debugEffects") !== "1")
      return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client reveal
    setEnabled(true);
    const id = window.setInterval(() => force((n) => (n + 1) % 1e6), 250);
    return () => window.clearInterval(id);
  }, []);

  if (!enabled) return null;

  const t = telemetry;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const row = (label: string, value: string) => (
    <div className={styles.row}>
      <span className={styles.k}>{label}</span>
      <span className={styles.v}>{value}</span>
    </div>
  );

  const flip = (
    key:
      | "ENABLE_FREQUENCY_FIELD"
      | "ENABLE_SONIC_PULSE"
      | "ENABLE_DESKTOP_SPECTRAL_HEATMAP",
  ) => {
    EFFECTS[key] = !EFFECTS[key];
    force((n) => n + 1);
  };
  const pick = (fn: (v: number) => void) => (v: number) => {
    fn(v);
    force((n) => n + 1);
  };
  const setIntensity = pick(setSonicIntensity);
  const setHmInt = pick(setHeatmapIntensity);
  const setHmH = pick(setHeatmapMaxHeight);
  const setHmSmooth = pick(setHeatmapSmoothing);
  const setHmOp = pick(setHeatmapOpacity);
  const seg = (
    current: number,
    opts: [string, number][],
    onPick: (v: number) => void,
  ) => (
    <div className={styles.toggles}>
      {opts.map(([label, v]) => (
        <button
          key={label}
          type="button"
          className={`${styles.toggle} ${current === v ? styles.on : ""}`}
          onClick={() => onPick(v)}
        >
          {label}
        </button>
      ))}
    </div>
  );
  const trio = (label: string, a: number, b: number, c: number) => (
    <div className={styles.row}>
      <span className={styles.k}>{label}</span>
      <span className={styles.v}>
        {pct(a)} {pct(b)} {pct(c)}
      </span>
    </div>
  );

  return (
    <div className={styles.panel} aria-hidden="true">
      <div className={styles.title}>effects debug</div>
      <div className={styles.toggles}>
        <button
          type="button"
          className={`${styles.toggle} ${EFFECTS.ENABLE_FREQUENCY_FIELD ? styles.on : ""}`}
          onClick={() => flip("ENABLE_FREQUENCY_FIELD")}
        >
          FIELD {EFFECTS.ENABLE_FREQUENCY_FIELD ? "ON" : "OFF"}
        </button>
        <button
          type="button"
          className={`${styles.toggle} ${EFFECTS.ENABLE_SONIC_PULSE ? styles.on : ""}`}
          onClick={() => flip("ENABLE_SONIC_PULSE")}
        >
          PULSE {EFFECTS.ENABLE_SONIC_PULSE ? "ON" : "OFF"}
        </button>
      </div>

      <div className={styles.section}>sonic intensity</div>
      <div className={styles.toggles}>
        {[
          ["OFF", 0],
          ["1×", 1],
          ["2.5×", 2.5],
          ["4×", 4],
        ].map(([label, v]) => (
          <button
            key={label}
            type="button"
            className={`${styles.toggle} ${PULSE.sonicIntensity === v ? styles.on : ""}`}
            onClick={() => setIntensity(v as number)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={styles.toggles}>
        <button
          type="button"
          className={`${styles.toggle} ${EFFECTS.ENABLE_DESKTOP_SPECTRAL_HEATMAP ? styles.on : ""}`}
          onClick={() => flip("ENABLE_DESKTOP_SPECTRAL_HEATMAP")}
        >
          HEATMAP {EFFECTS.ENABLE_DESKTOP_SPECTRAL_HEATMAP ? "ON" : "OFF"}
        </button>
      </div>
      <div className={styles.section}>heatmap max height</div>
      {seg(
        HEATMAP.maxHeightPx,
        [
          ["60", 60],
          ["80", 80],
          ["100", 100],
        ],
        setHmH,
      )}
      <div className={styles.section}>heatmap intensity</div>
      {seg(
        HEATMAP.intensity,
        [
          ["0.5×", 0.5],
          ["1×", 1],
          ["1.5×", 1.5],
          ["2×", 2],
        ],
        setHmInt,
      )}
      <div className={styles.section}>spatial smoothing</div>
      {seg(
        HEATMAP.smoothing,
        [
          ["LOW", 0],
          ["MED", 1],
          ["HIGH", 2],
        ],
        setHmSmooth,
      )}
      <div className={styles.section}>colour opacity</div>
      {seg(
        HEATMAP.opacity,
        [
          ["25%", 0.25],
          ["40%", 0.4],
          ["55%", 0.55],
          ["70%", 0.7],
        ],
        setHmOp,
      )}
      {row("bands", HEATMAP.numBands.toString())}
      {row("hm active", t.hmActive ? "yes" : "no")}
      {trio("sub/bass/mid", t.hmSub, t.hmBass, t.hmMid)}
      {row("high energy", pct(t.hmHigh))}
      {row("hm peak", pct(t.hmPeak))}
      {row("hm max px", `${Math.round(t.hmMaxHeightPx)}px`)}

      <div className={styles.section}>audio (bass / mid / high)</div>
      {trio("raw", t.rawBass, t.rawMid, t.rawHigh)}
      {trio("norm", t.normBass, t.normMid, t.normHigh)}
      {trio("smooth", t.bass, t.mid, t.high)}
      {row("pulse", pct(t.pulseStrength))}
      {row("bg off", pct(t.bgOffset))}
      {row("refr off", pct(t.refractOffset))}
      {row("mono scale", t.monoScale.toFixed(3))}

      <div className={styles.section}>state</div>
      {row("field", pct(t.fieldStrength))}
      {row("heat", pct(t.heat))}
      {row("dpr", t.dpr.toFixed(2))}
      {row("fps", Math.round(t.fps).toString())}
      {row("audioCtx", t.audioState)}
      {row("playing", t.playing ? "yes" : "no")}
    </div>
  );
}
