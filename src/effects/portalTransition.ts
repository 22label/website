/**
 * Monogram Portal Transition — desktop-only cinematic route transition state.
 *
 * A singleton module (same pattern as audioReactive/effectsConfig): mutable state
 * written by the React controller (PortalNav) and READ every frame by the WebGL
 * loop (Monogram) — no per-frame React state. The controller owns the clock; this
 * module holds the state, the calibration, the easing and the pure visual math.
 *
 * Coverage model: the persistent monogram canvas always renders the (opaque) Home
 * scene. At rest its opacity is `idleRest` (1 on Home / below the desktop
 * breakpoint, 0 on internal desktop routes). During a transition the controller
 * advances `progress`; `computeVisual()` raises the canvas opacity to a full
 * cover (guaranteed opaque by the marquee background plane → no flash), dives the
 * glass (zoom + transient scale + refraction), the route swaps while covered, and
 * the opacity eases to the DESTINATION rest level, revealing the new page.
 */
import { EFFECTS, telemetry } from "./effectsConfig";

export type PortalPhase =
  | "idle"
  | "engaging"
  | "diving"
  | "covered"
  | "revealing";
export type PortalDirection = "forward" | "reverse";
export type CameraDepth = "LOW" | "MEDIUM" | "HIGH";

/** Central calibration — all magic numbers live here; the debug panel mutates
 *  the runtime ones live. */
export const PORTAL = {
  minWidthPx: 1024, // desktop-only: no transition below this width
  durationMs: 640, // runtime 500 / 640 / 700
  refractionIntensity: 1, // runtime 0.75 / 1 / 1.25 / 1.5
  cameraDepth: "MEDIUM" as CameraDepth, // runtime LOW / MEDIUM / HIGH
  reducedMaxMs: 220, // reduced-motion crossfade ceiling

  // Timeline fractions of the total duration (forward).
  tEngageEnd: 0.156, // ~100ms @640
  tCoverStart: 0.42, // canvas fully opaque by here (glass fills the viewport)
  tSwap: 0.55, // router.push fired once here (fully covered)
  tRevealStart: 0.66, // ~420ms @640 — glass begins to recede, page emerges

  // Peak dive per camera-depth preset (zoom magnification, transient monogram
  // scale multiplier, refraction multiplier at the cover peak).
  depth: {
    LOW: { zoom: 2.2, scale: 2.2, refract: 1.8 },
    MEDIUM: { zoom: 3.2, scale: 3.2, refract: 2.2 },
    HIGH: { zoom: 4.4, scale: 4.4, refract: 2.8 },
  } as Record<CameraDepth, { zoom: number; scale: number; refract: number }>,
  blurPeak: 0.01, // transient extra refraction blur at the peak
  dispPeak: 0.004, // transient extra RGB dispersion at the peak

  // Aim point (the "cavity") in monogram-local space, as a fraction of the
  // geometry's natural height from its centre (+x right, +y up). Debug-tunable.
  aimX: 0.14,
  aimY: 0.1,
  showTargetMarker: false, // debug-only cavity marker
};

type State = {
  active: boolean;
  phase: PortalPhase;
  direction: PortalDirection;
  progress: number; // 0..1
  srcRest: number; // source-route rest presence (0|1)
  dstRest: number; // destination-route rest presence (0|1)
  idleRest: number; // current route's rest presence (canvas opacity when idle)
  navIndex: number;
  locked: boolean; // navigation/input locked during the run
};

const state: State = {
  active: false,
  phase: "idle",
  direction: "forward",
  progress: 0,
  srcRest: 1,
  dstRest: 1,
  idleRest: 1,
  navIndex: 0,
  locked: false,
};

export function getPortalState(): Readonly<State> {
  return state;
}

/** The transition only runs on desktop (>= minWidthPx) with the flag on. */
export function portalEnabled(): boolean {
  return (
    EFFECTS.ENABLE_DESKTOP_MONOGRAM_PORTAL_TRANSITION &&
    typeof window !== "undefined" &&
    window.innerWidth >= PORTAL.minWidthPx
  );
}

// ---- easing ----------------------------------------------------------------
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeInCubic = (x: number) => x * x * x;
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

export function phaseFromProgress(p: number): PortalPhase {
  if (p <= 0 || p >= 1) return "idle";
  if (p < PORTAL.tEngageEnd) return "engaging";
  if (p < PORTAL.tCoverStart) return "diving";
  if (p < PORTAL.tRevealStart) return "covered";
  return "revealing";
}

export type PortalVisual = {
  presence: number; // canvas opacity / coverage (0..1)
  zoom: number; // ortho camera zoom (1 = base)
  panX: number; // 0..aimX — pan toward the cavity (fraction)
  panY: number;
  scaleBoost: number; // transient monogram scale addend
  refractMul: number; // refraction multiplier (1 = base)
  blurAdd: number;
  dispAdd: number;
  fieldAtten: number; // Frequency-Field attenuation (1 = full, 0 = none)
  sonicAtten: number; // Sonic-Pulse attenuation (1 = full)
};

const IDLE_VISUAL: PortalVisual = {
  presence: 1,
  zoom: 1,
  panX: 0,
  panY: 0,
  scaleBoost: 0,
  refractMul: 1,
  blurAdd: 0,
  dispAdd: 0,
  fieldAtten: 1,
  sonicAtten: 1,
};

/** Pure visual math for a given progress. `srcRest`/`dstRest` let the canvas
 *  opacity travel from the source route's rest level, up to a full cover, then
 *  down to the destination route's rest level (so Home↔internal reveal cleanly). */
export function computeVisual(
  p: number,
  srcRest: number,
  dstRest: number,
): PortalVisual {
  const d = PORTAL.depth[PORTAL.cameraDepth];
  const swap = PORTAL.tSwap;
  // dive bell: strong ease-in up to the cover peak, soft ease-out back down
  const up = easeInCubic(clamp01(p / swap));
  const down = 1 - easeOutCubic(clamp01((p - swap) / (1 - swap)));
  const env = p <= swap ? up : down;

  let presence: number;
  if (p <= PORTAL.tCoverStart) {
    presence = srcRest + (1 - srcRest) * easeInCubic(clamp01(p / PORTAL.tCoverStart));
  } else if (p < PORTAL.tRevealStart) {
    presence = 1;
  } else {
    presence =
      1 +
      (dstRest - 1) *
        easeOutCubic(clamp01((p - PORTAL.tRevealStart) / (1 - PORTAL.tRevealStart)));
  }

  const refractPeak = d.refract * PORTAL.refractionIntensity;
  return {
    presence,
    zoom: 1 + (d.zoom - 1) * env,
    panX: PORTAL.aimX * env,
    panY: PORTAL.aimY * env,
    scaleBoost: d.scale * env,
    refractMul: 1 + (refractPeak - 1) * env,
    blurAdd: PORTAL.blurPeak * env,
    dispAdd: PORTAL.dispPeak * env,
    fieldAtten: 1 - env,
    sonicAtten: 1 - 0.6 * env,
  };
}

/** The visual to apply THIS frame (idle → canvas sits at its rest presence). */
export function currentVisual(): PortalVisual {
  if (!state.active) {
    // reuse a shared object but reflect the idle rest presence
    IDLE_VISUAL.presence = state.idleRest;
    return IDLE_VISUAL;
  }
  return computeVisual(state.progress, state.srcRest, state.dstRest);
}

// ---- controller-facing setters (React writes, WebGL reads) -----------------
function writeTelemetry(): void {
  telemetry.portalActive = state.active;
  telemetry.portalPhase = state.phase;
  telemetry.portalProgress = state.progress;
  telemetry.portalDirection = state.direction;
  telemetry.portalNavIndex = state.navIndex;
  telemetry.portalLocked = state.locked;
  telemetry.portalDepth = PORTAL.cameraDepth;
  telemetry.portalDuration = PORTAL.durationMs;
  telemetry.portalRefractIntensity = PORTAL.refractionIntensity;
}

/** Begin a run. `srcRest`/`dstRest` are the source/destination rest presences. */
export function startTransition(
  direction: PortalDirection,
  srcRest: number,
  dstRest: number,
  src: string,
  dst: string,
): void {
  state.active = true;
  state.locked = true;
  state.direction = direction;
  state.progress = 0;
  state.srcRest = srcRest;
  state.dstRest = dstRest;
  state.phase = "engaging";
  telemetry.portalSource = src;
  telemetry.portalDest = dst;
  writeTelemetry();
}

export function updateProgress(p: number): void {
  state.progress = clamp01(p);
  state.phase = phaseFromProgress(state.progress);
  writeTelemetry();
}

export function endTransition(): void {
  state.active = false;
  state.locked = false;
  state.progress = 0;
  state.phase = "idle";
  writeTelemetry();
}

/** Set the current route's rest presence (canvas opacity when idle). */
export function setIdleRest(v: number): void {
  state.idleRest = v;
  if (!state.active) telemetry.portalPresence = v;
}

export function setNavIndex(i: number): void {
  state.navIndex = i;
  telemetry.portalNavIndex = i;
}

// ---- runtime setters for the debug panel -----------------------------------
export function setPortalDuration(v: number): void {
  PORTAL.durationMs = v;
}
export function setPortalRefraction(v: number): void {
  PORTAL.refractionIntensity = v;
}
export function setPortalCameraDepth(v: CameraDepth): void {
  PORTAL.cameraDepth = v;
}
export function setPortalTargetMarker(v: boolean): void {
  PORTAL.showTargetMarker = v;
}
