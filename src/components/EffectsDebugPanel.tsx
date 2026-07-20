"use client";

import { useEffect, useState } from "react";
import {
  EFFECTS,
  HEATMAP,
  PULSE,
  TACTILE,
  setHeatmapIntensity,
  setHeatmapMaxHeight,
  setHeatmapMobileOpacity,
  setHeatmapOpacity,
  setHeatmapSmoothing,
  setMobileSonicIntensity,
  setSonicIntensity,
  setTactileHoldMs,
  setTactilePressureIntensity,
  setTactileRippleIntensity,
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
    // Expose the live telemetry for real-time inspection while debugging (only
    // ever with ?debugEffects=1; harmless and absent for normal visitors).
    (window as unknown as { __telemetry?: typeof telemetry }).__telemetry =
      telemetry;
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
      | "ENABLE_DESKTOP_SPECTRAL_HEATMAP"
      | "ENABLE_MOBILE_TACTILE_PRESSURE",
  ) => {
    EFFECTS[key] = !EFFECTS[key];
    force((n) => n + 1);
  };
  const pick = (fn: (v: number) => void) => (v: number) => {
    fn(v);
    force((n) => n + 1);
  };
  const isMobileVp =
    typeof window !== "undefined" && window.innerWidth <= 767;
  const setIntensity = pick(setSonicIntensity);
  const setMobileIntensity = pick(setMobileSonicIntensity);
  const setHmInt = pick(setHeatmapIntensity);
  const setHmH = pick(setHeatmapMaxHeight);
  const setHmSmooth = pick(setHeatmapSmoothing);
  const setHmOp = pick(setHeatmapOpacity);
  const setHmMobileOp = pick(setHeatmapMobileOpacity);
  const setTacP = pick(setTactilePressureIntensity);
  const setTacR = pick(setTactileRippleIntensity);
  const setTacH = pick(setTactileHoldMs);
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

      <div className={styles.section}>
        sonic intensity ({isMobileVp ? "mobile" : "desktop"})
      </div>
      {isMobileVp
        ? seg(
            PULSE.mobile.intensity,
            [
              ["OFF", 0],
              ["1.75×", 1.75],
              ["2.5×", 2.5],
              ["3.13×", 3.125],
              ["3.75×", 3.75],
            ],
            setMobileIntensity,
          )
        : seg(
            PULSE.desktop.intensity,
            [
              ["OFF", 0],
              ["1×", 1],
              ["2.5×", 2.5],
              ["4×", 4],
            ],
            setIntensity,
          )}
      {row("mode", t.mode)}

      {t.mode === "PRECOMPUTED_MOBILE" ? (
        <>
          <div className={styles.section}>playback · DIRECT_HTML_MEDIA</div>
          {row("paused", t.mediaPaused ? "yes" : "no")}
          {row("muted", t.mediaMuted ? "yes" : "no")}
          {row("volume", t.mediaVolume.toFixed(2))}
          {row("time", `${t.mediaCurrentTime.toFixed(2)}s`)}
          {row("duration", `${t.mediaDuration.toFixed(2)}s`)}
          {row("readyState", t.mediaReadyState.toString())}
          {row("play error", t.mediaError || "—")}
          <div className={styles.section}>analysis · PRECOMPUTED</div>
          {row("asset", t.analysisLoaded ? "loaded" : "loading…")}
          {row("frame", `${t.analysisFrame} @ ${t.analysisFps}fps`)}
          {row("bands", HEATMAP.numBands.toString())}
          {trio("bass/mid/high", t.mBass, t.mMid, t.mHigh)}
          {row("rms / peak", `${pct(t.mRms)} / ${pct(t.mPeak)}`)}
        </>
      ) : (
        <>
          {row("playback", t.audioSourceCount ? "gapless buffer" : "idle")}
          {row("ctx", t.audioState)}
          {row("src count", t.audioSourceCount.toString())}
          {row("offset", `${t.audioOffset.toFixed(2)}s`)}
          {row(
            "loop",
            `${t.loopStart.toFixed(2)}–${t.loopEnd.toFixed(2)}s`,
          )}
        </>
      )}

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
      <div className={styles.section}>
        colour opacity ({isMobileVp ? "mobile" : "desktop"})
      </div>
      {seg(
        isMobileVp ? HEATMAP.mobileOpacity : HEATMAP.opacity,
        [
          ["25%", 0.25],
          ["40%", 0.4],
          ["55%", 0.55],
          ["70%", 0.7],
        ],
        isMobileVp ? setHmMobileOp : setHmOp,
      )}
      {row("bands", HEATMAP.numBands.toString())}
      {row("hm mounted", t.hmMounted ? "yes" : "no")}
      {row("hm active", t.hmActive ? "yes" : "no")}
      {row("hm opacity", pct(t.hmOpacity))}
      {row("hm height", `${Math.round(t.hmHeightPx)}px`)}
      {row("renderOrder", t.hmRenderOrder.toString())}
      {trio("sub/bass/mid", t.hmSub, t.hmBass, t.hmMid)}
      {row("high energy", pct(t.hmHigh))}
      {row("hm peak", pct(t.hmPeak))}
      {row("hm max energy px", `${Math.round(t.hmMaxHeightPx)}px`)}

      <div className={styles.toggles}>
        <button
          type="button"
          className={`${styles.toggle} ${EFFECTS.ENABLE_MOBILE_TACTILE_PRESSURE ? styles.on : ""}`}
          onClick={() => flip("ENABLE_MOBILE_TACTILE_PRESSURE")}
        >
          TACTILE {EFFECTS.ENABLE_MOBILE_TACTILE_PRESSURE ? "ON" : "OFF"}
        </button>
      </div>
      <div className={styles.section}>pressure intensity</div>
      {seg(
        TACTILE.pressureIntensity,
        [
          ["OFF", 0],
          ["0.5×", 0.5],
          ["1×", 1],
          ["1.5×", 1.5],
        ],
        setTacP,
      )}
      <div className={styles.section}>ripple intensity</div>
      {seg(
        TACTILE.rippleIntensity,
        [
          ["OFF", 0],
          ["0.5×", 0.5],
          ["1×", 1],
          ["1.5×", 1.5],
        ],
        setTacR,
      )}
      <div className={styles.section}>hold activation</div>
      {seg(
        TACTILE.holdActivationMs,
        [
          ["180", 180],
          ["220", 220],
          ["280", 280],
        ],
        setTacH,
      )}
      {row("candidate", t.tacCandidate ? "yes" : "no")}
      {row("press active", t.tacActive ? "yes" : "no")}
      {row("scroll cancel", t.tacScrollCancelled ? "yes" : "no")}
      {row("hit monogram", t.tacHitMonogram ? "yes" : "no")}
      {row("touch x/y", `${t.tacTouchX.toFixed(2)} ${t.tacTouchY.toFixed(2)}`)}
      {row("hold ms", `${Math.round(t.tacHoldMs)}`)}
      {row("pressure", pct(t.tacPressStrength))}
      {row("refr boost", pct(t.tacRefractBoost))}
      {row("ripple prog", t.tacRippleProgress < 0 ? "—" : pct(t.tacRippleProgress))}
      {row("ripple radius", t.tacRippleRadius.toFixed(2))}
      {row("haptic", t.tacHapticSupported ? "supported" : "no")}

      <div className={styles.section}>audio (bass / mid / high)</div>
      {trio("raw", t.rawBass, t.rawMid, t.rawHigh)}
      {trio("norm", t.normBass, t.normMid, t.normHigh)}
      {trio("smooth", t.bass, t.mid, t.high)}
      {row("pulse", pct(t.pulseStrength))}
      {row("final pulse", `${pct(t.sonicFinal)} @ ${t.sonicIntensity}×`)}
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
