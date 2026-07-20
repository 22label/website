"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  PORTAL,
  portalEnabled,
  startTransition,
  updateProgress,
  endTransition,
  setNavIndex,
  getPortalState,
  type PortalPhase,
  type PortalDirection,
} from "@/effects/portalTransition";

/**
 * Desktop Monogram Portal Transition — the React controller.
 *
 * Owns the transition CLOCK (a single rAF) and NAVIGATION; the WebGL scene
 * (Monogram) is a pure consumer that reads `portalTransition` state each frame.
 * Provides `navigate()` (used by the desktop nav + logo, guarded to real
 * unmodified left-clicks) and a coarse `phase` (a few updates per run, never
 * per-frame) so route content can hold its entrance animation until `revealing`.
 *
 * The scene canvas always renders the opaque Home scene; the controller raises
 * its coverage (opacity) to hide the `router.push` swap, then lowers it to the
 * destination route's rest level so the new page emerges. Browser Back/Forward
 * are detected via a namespaced `history.state.__2h2hNavIndex` and played in
 * reverse — since popstate fires after the DOM already changed, the persistent
 * glass is raised to cover the swap, then the reveal plays. Everything resets on
 * a ~1200ms failsafe so the scene can never get stuck.
 */

type Ctx = {
  navigate: (href: string) => void;
  phase: PortalPhase;
  direction: PortalDirection;
  active: boolean;
};

const PortalContext = createContext<Ctx | null>(null);

export function usePortalNav(): Ctx {
  return (
    useContext(PortalContext) ?? {
      navigate: () => {},
      phase: "idle",
      direction: "forward",
      active: false,
    }
  );
}

/** onClick factory for intercepted internal links (desktop nav + logo). Lets the
 *  browser handle modified/middle clicks (new tab, etc.); otherwise runs the
 *  portal transition and prevents the default navigation. */
export function useNavClick(): (href: string) => (e: React.MouseEvent) => void {
  const { navigate } = usePortalNav();
  return (href: string) => (e: React.MouseEvent) => {
    if (e.defaultPrevented) return;
    if (
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    )
      return; // Cmd/Ctrl/Shift/Alt/middle → native behaviour (new tab, etc.)
    e.preventDefault();
    navigate(href);
  };
}

/** True while a FORWARD run is covering — route content should hold its entrance
 *  animation until `revealing`. Reverse (popstate) content is already swapped by
 *  the browser and simply covered, so it does not hold. */
export function usePortalHold(): boolean {
  const { phase, direction, active } = usePortalNav();
  return (
    active &&
    direction === "forward" &&
    phase !== "revealing" &&
    phase !== "idle"
  );
}

const restFor = (path: string): number => (path === "/" ? 1 : 0);
const FAILSAFE_MS = 1200;

export default function PortalNav({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [phase, setPhase] = useState<PortalPhase>("idle");
  const [direction, setDirection] = useState<PortalDirection>("forward");
  const [active, setActive] = useState(false);
  const [announce, setAnnounce] = useState("");

  const rafRef = useRef(0);
  const failsafeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swappedRef = useRef(false);
  const indexRef = useRef(0);
  const prevPathRef = useRef("/");
  const lastPhaseRef = useRef<PortalPhase>("idle");

  const prefersReduced = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const syncPhase = useCallback(() => {
    const p = getPortalState().phase;
    if (p !== lastPhaseRef.current) {
      lastPhaseRef.current = p;
      setPhase(p);
    }
  }, []);

  const clearFailsafe = useCallback(() => {
    if (failsafeRef.current) {
      clearTimeout(failsafeRef.current);
      failsafeRef.current = null;
    }
  }, []);

  const finish = useCallback(
    (to: string) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      clearFailsafe();
      endTransition();
      setActive(false);
      setPhase("idle");
      lastPhaseRef.current = "idle";
      // Semantic focus + route announcement (a11y). No focusable overlay.
      const main = document.querySelector("main");
      if (main) {
        main.setAttribute("tabindex", "-1");
        (main as HTMLElement).focus({ preventScroll: true });
      }
      const name =
        to === "/"
          ? "Home"
          : to.replace(/^\//, "").replace(/-/g, " ") || "Home";
      setAnnounce(name);
    },
    [clearFailsafe],
  );

  const armFailsafe = useCallback(
    (to: string) => {
      clearFailsafe();
      failsafeRef.current = setTimeout(() => finish(to), FAILSAFE_MS);
    },
    [clearFailsafe, finish],
  );

  // Patch the freshly-pushed history entry with our namespaced index (preserving
  // every Next.js key). Runs after router.push has committed the new entry.
  const bumpIndex = useCallback(() => {
    const next = indexRef.current + 1;
    indexRef.current = next;
    setNavIndex(next);
    requestAnimationFrame(() => {
      const s = (window.history.state as Record<string, unknown>) || {};
      window.history.replaceState({ ...s, __2h2hNavIndex: next }, "");
    });
  }, []);

  const runForward = useCallback(
    (from: string, to: string) => {
      startTransition("forward", restFor(from), restFor(to), from, to);
      setDirection("forward");
      setActive(true);
      setPhase("engaging");
      lastPhaseRef.current = "engaging";
      swappedRef.current = false;
      armFailsafe(to);
      const start = performance.now();
      const dur = PORTAL.durationMs;
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / dur);
        updateProgress(p);
        syncPhase();
        if (!swappedRef.current && p >= PORTAL.tSwap) {
          swappedRef.current = true;
          router.push(to);
          bumpIndex();
        }
        if (p >= 1) {
          finish(to);
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [armFailsafe, bumpIndex, finish, router, syncPhase],
  );

  // Reverse (browser Back/Forward): the DOM already swapped, so we do NOT push —
  // we raise the persistent cover immediately (start already covered), then play
  // the reveal over the new content.
  const runReverse = useCallback(
    (from: string, to: string, dir: PortalDirection) => {
      startTransition(dir, restFor(from), restFor(to), from, to);
      setDirection(dir);
      setActive(true);
      // Cover immediately to hide the just-swapped content.
      updateProgress(PORTAL.tCoverStart);
      syncPhase();
      armFailsafe(to);
      const start = performance.now();
      const dur = PORTAL.durationMs * (1 - PORTAL.tCoverStart);
      const tick = (now: number) => {
        const p = Math.min(
          1,
          PORTAL.tCoverStart + ((now - start) / dur) * (1 - PORTAL.tCoverStart),
        );
        updateProgress(p);
        syncPhase();
        if (p >= 1) {
          finish(to);
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [armFailsafe, finish, syncPhase],
  );

  const navigate = useCallback(
    (href: string) => {
      const from = window.location.pathname;
      if (href === from) return; // active route → no-op, no duplicate push
      if (!portalEnabled() || prefersReduced()) {
        router.push(href); // below breakpoint / flag off / reduced motion
        return;
      }
      if (getPortalState().active) return; // ignore clicks during a run
      runForward(from, href);
    },
    [router, runForward],
  );

  // Seed the namespaced nav index + popstate direction tracking.
  useEffect(() => {
    const s = (window.history.state as Record<string, unknown>) || {};
    if (typeof s.__2h2hNavIndex === "number") {
      indexRef.current = s.__2h2hNavIndex as number;
    } else {
      indexRef.current = 0;
      window.history.replaceState({ ...s, __2h2hNavIndex: 0 }, "");
    }
    setNavIndex(indexRef.current);
    prevPathRef.current = window.location.pathname;

    const onPop = (e: PopStateEvent) => {
      if (!portalEnabled() || prefersReduced()) {
        prevPathRef.current = window.location.pathname;
        const st = (e.state as Record<string, unknown>) || {};
        if (typeof st.__2h2hNavIndex === "number")
          indexRef.current = st.__2h2hNavIndex as number;
        return;
      }
      const st = (e.state as Record<string, unknown>) || {};
      const newIndex =
        typeof st.__2h2hNavIndex === "number"
          ? (st.__2h2hNavIndex as number)
          : 0;
      const dir: PortalDirection =
        newIndex < indexRef.current ? "reverse" : "forward";
      indexRef.current = newIndex;
      setNavIndex(newIndex);
      const from = prevPathRef.current;
      const to = window.location.pathname;
      prevPathRef.current = to;
      if (from === to) return;
      if (getPortalState().active) return;
      runReverse(from, to, dir);
    };
    window.addEventListener("popstate", onPop);

    // Fail-safe on tab hide: settle to a consistent idle rather than a stuck run.
    const onHide = () => {
      if (document.hidden && getPortalState().active) {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
        clearFailsafe();
        endTransition();
        setActive(false);
        setPhase("idle");
        lastPhaseRef.current = "idle";
      }
    };
    document.addEventListener("visibilitychange", onHide);

    return () => {
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("visibilitychange", onHide);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearFailsafe();
    };
  }, [runReverse, clearFailsafe]);

  return (
    <PortalContext.Provider value={{ navigate, phase, direction, active }}>
      {children}
      {/* a11y: route change announcement (visually hidden, no layout) */}
      <div
        aria-live="polite"
        role="status"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          margin: -1,
          padding: 0,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {announce}
      </div>
    </PortalContext.Provider>
  );
}
