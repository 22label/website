"use client";

import { useEffect, useState } from "react";
import {
  EFFECTS,
  PULSE,
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

  const flip = (key: "ENABLE_FREQUENCY_FIELD" | "ENABLE_SONIC_PULSE") => {
    EFFECTS[key] = !EFFECTS[key];
    force((n) => n + 1);
  };
  const setIntensity = (v: number) => {
    setSonicIntensity(v);
    force((n) => n + 1);
  };
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
