"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { EFFECTS, TRAIL } from "@/effects/effectsConfig";
import styles from "./CursorTrail.module.css";

/**
 * Localized cursor ghost trail — a very subtle refraction trace that appears
 * ONLY inside approved zones on desktop pointers: the central 3D glass, relevant
 * imagery, and the primary nav links.
 *
 * One decoupled 2D canvas overlay (pointer-events:none, DPR-clamped), fully
 * separate from the Three.js scene. It never re-renders React per frame: a single
 * rAF runs only while there are points to draw and stops when the trace has faded
 * (within `lifeMs`). Outside the zones nothing is sampled, so the trail vanishes
 * completely. Touch/pen pointers, mobile, and reduced motion opt out entirely.
 *
 * Zone detection: DOM zones via event.target.closest(TRAIL.selector); the glass
 * is a centered geometric region (Home only) because the scene canvas is
 * pointer-events:none and cannot be hit-tested through the event target.
 *
 * Segmenting: each sample carries a `seg` id. Leaving every approved zone arms a
 * break, so the next in-zone sample starts a NEW segment and the stroke is only
 * ever drawn between consecutive points of the SAME segment — a trace never
 * bridges an unapproved area when the pointer exits one zone and enters another
 * within `lifeMs`. Existing points keep fading normally; nothing is cleared early.
 */
export default function CursorTrail() {
  const pathname = usePathname();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isHomeRef = useRef(pathname === "/");

  // Keep the glass-region gate current without re-attaching listeners.
  useEffect(() => {
    isHomeRef.current = pathname === "/";
  }, [pathname]);

  useEffect(() => {
    if (!EFFECTS.ENABLE_CURSOR_TRAIL) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Desktop precise pointers only; reduced motion opts out entirely.
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let vw = 0;
    let vh = 0;
    const resize = () => {
      vw = window.innerWidth;
      vh = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, TRAIL.dprMax);
      canvas.width = Math.round(vw * dpr);
      canvas.height = Math.round(vh * dpr);
      canvas.style.width = `${vw}px`;
      canvas.style.height = `${vh}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    };
    resize();

    type Pt = { x: number; y: number; t: number; seg: number };
    const pts: Pt[] = [];
    let raf = 0;
    let lastX = 0;
    let lastY = 0;
    let hasLast = false;
    let seg = 0;
    let armedBreak = false; // set on zone exit → next in-zone sample starts a new seg

    const inGlass = (x: number, y: number) => {
      if (!isHomeRef.current) return false; // glass only visible on Home
      const halfW = (vw * TRAIL.glassRegion.wFrac) / 2;
      const halfH = (vh * TRAIL.glassRegion.hFrac) / 2;
      return Math.abs(x - vw / 2) <= halfW && Math.abs(y - vh / 2) <= halfH;
    };

    const inZone = (e: PointerEvent) => {
      if (inGlass(e.clientX, e.clientY)) return true;
      const el = e.target as Element | null;
      return !!el?.closest?.(TRAIL.selector);
    };

    const draw = () => {
      const now = performance.now();
      while (pts.length && now - pts[0].t > TRAIL.lifeMs) pts.shift();
      ctx.clearRect(0, 0, vw, vh);
      const [r, g, b] = TRAIL.color;
      for (let i = 1; i < pts.length; i++) {
        const p0 = pts[i - 1];
        const p1 = pts[i];
        if (p0.seg !== p1.seg) continue; // never bridge across a zone gap
        const age = (now - p1.t) / TRAIL.lifeMs; // 0 new → 1 old
        if (age >= 1) continue;
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len; // perpendicular → transverse refraction offset
        const ny = dx / len;
        // main trace + a fainter, slightly displaced refraction ghost
        for (let pass = 0; pass < 2; pass++) {
          const off = pass === 0 ? 0 : TRAIL.refractOffsetPx;
          const a = TRAIL.baseOpacity * (1 - age) * (pass === 0 ? 1 : 0.5);
          ctx.strokeStyle = `rgba(${r},${g},${b},${a.toFixed(3)})`;
          ctx.lineWidth = TRAIL.lineWidth * (1 - age * 0.5);
          ctx.beginPath();
          ctx.moveTo(p0.x + nx * off, p0.y + ny * off);
          ctx.lineTo(p1.x + nx * off, p1.y + ny * off);
          ctx.stroke();
        }
      }
      if (pts.length) {
        raf = requestAnimationFrame(draw);
      } else {
        raf = 0;
        ctx.clearRect(0, 0, vw, vh);
      }
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType && e.pointerType !== "mouse") return; // no touch/pen
      if (!inZone(e)) {
        // Left the approved zones: arm a segment break (do NOT clear existing
        // points — they keep fading) and reset the distance gate so the next
        // re-entry samples immediately as a fresh segment.
        armedBreak = true;
        hasLast = false;
        return;
      }
      const x = e.clientX;
      const y = e.clientY;
      if (armedBreak) {
        seg += 1;
        armedBreak = false;
      }
      if (hasLast && Math.hypot(x - lastX, y - lastY) < TRAIL.minMovePx) return;
      lastX = x;
      lastY = y;
      hasLast = true;
      pts.push({ x, y, t: performance.now(), seg });
      if (pts.length > TRAIL.maxPoints) pts.shift();
      if (!raf) raf = requestAnimationFrame(draw);
    };

    const onDocLeave = () => {
      armedBreak = true; // leaving the window ends the current segment
      hasLast = false;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("resize", resize);
    document.addEventListener("mouseleave", onDocLeave);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", resize);
      document.removeEventListener("mouseleave", onDocLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />;
}
