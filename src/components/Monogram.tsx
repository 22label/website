"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./Monogram.module.css";
import {
  CLAMP,
  EFFECTS,
  FIELD,
  HEATMAP,
  PULSE,
  TACTILE,
  telemetry,
} from "@/effects/effectsConfig";
import {
  getBands as getAudioBands,
  getEnv as getAudioEnv,
  getHeatmap as getAudioHeatmap,
  setExternalDriver as setAudioDriver,
  tick as audioTick,
} from "@/effects/audioReactive";
import {
  currentVisual as portalVisual,
  getPortalState,
  PORTAL,
} from "@/effects/portalTransition";

/* ------------------------------------------------------------------
   Home centre — REAL extruded WebGL glass monogram + a "GUIDED BY
   FREQUENCY" marquee that lives in the SAME scene, so the glass genuinely
   refracts it.

   The marquee + page gradient share ONE full-viewport opaque plane behind
   the monogram (a ShaderMaterial that draws the exact page gradient and the
   scrolling text band). Being opaque, it is captured by the transmission
   pass → refracted through the glass. Layer order: gradient+marquee plane →
   glass monogram (+ RGB glitch ghosts) → HTML corner UI (in the DOM).

   Preserved: geometry, 192 depth, glass material, fit + 64px margins, wheel
   rotation + inertia, RGB glitch.
   ------------------------------------------------------------------ */

const EXTRUDE_DEPTH = 192;
const BEVEL_THICKNESS = 2.5;
const BEVEL_SIZE = 2;
const BEVEL_SEGMENTS = 6;
const MARGIN = 64;

// --- Rotation inertia (frame-rate independent; radians + radians/second) ---
// Each wheel/trackpad event imparts an impulse to the angular velocity; the
// velocity then decays with exponential friction and rotation integrates it
// over real time, so the monogram keeps spinning briefly after input stops.
const IMPULSE_STRENGTH = 0.06; // rad/s added per unit of normalized wheel delta
const DAMPING_RATE = 3.8; // exponential friction, per second (~1.2s to rest)
const MAX_ANGULAR_VELOCITY = 50; // rad/s cap — technical guard, not felt in use
const STOP_THRESHOLD = 0.02; // rad/s — below this, snap to 0 (also gates cooldown)
const DRAG_SENSITIVITY = 0.0036; // rad per px of touch drag (unchanged feel)
const REDUCED_MOTION_ROTATE = 0.0006; // rad per delta unit, direct + no inertia

// --- Chromatic heating (thermal state driven by scroll intensity) ----------
const HEAT_HEX_COLD = 0xb0c7fd; // resting colour (#B0C7FD @ 11% visual)
const HEAT_HEX_HOT = 0xff0004; // fully heated colour (#FF0004 @ 22% visual)
const HEAT_DURATION_MS = 2000; // full-speed sustained scroll to reach full heat
const HEAT_FULL_SPEED = 8; // rad/s at/above which a scroll counts as "fast" (speedFactor=1)
const COOLDOWN_DURATION_MS = 1000; // full cool-down back to the cold state
const SCROLL_CONTINUITY_MS = 280; // gap under which scrolling counts as continuous
// Frost — the monogram turns progressively blurry only near max heat.
const BLUR_START = 0.78; // heatProgress at which frost begins (last stretch)
const BLUR_MAX_ADD = 0.016; // extra refraction-blur (UV) added on top of base at full heat

// RGB glitch
const GLITCH_TIMES_MS = [3000, 12000, 24000];
const GLITCH_CYCLE_MS = 60000;
const GLITCH_DURATION_MS = 230;

// Marquee
const MARQUEE_TEXT = "GUIDED BY FREQUENCY";
const MARQUEE_FONT_PX = 330;
const MARQUEE_LETTER_SPACING = 0.11; // 11%
const MARQUEE_GAP = 64;
const MARQUEE_BAND_H = 406;
const MARQUEE_CYCLE_MS = 33000; // ~33s per group -> elegant, slow

const MARQUEE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec2 uResolution;
  uniform sampler2D uText;
  uniform float uOffset;
  uniform float uGroupW;
  uniform float uBandH;
  uniform vec3 uDarkStop; // heat-driven second stop: #000000 -> #580001
  // Frequency Field (all 0 when the feature is off -> identical output) ---------
  uniform vec2 uFieldPos;     // normalized, y-down (0..1)
  uniform float uFieldStrength;
  uniform float uFieldRadius;
  uniform float uFieldDisp;   // local displacement, as a fraction of resolution
  uniform float uFieldScale;  // local scale variation (e.g. 0.025)
  uniform float uFieldGlow;   // background halo opacity (<= ~0.05)
  uniform vec3 uFieldColor;   // halo tint (cold #B0C7FD -> red on heat)
  uniform float uAudioBg;     // Sonic Pulse background micro-pulse (<= ~0.03)
  // Desktop spectral heatmap — continuous thermal field (env 0 -> skipped) ------
  uniform sampler2D uHmTex;   // band energies in .r (0..1), LINEAR filtered
  uniform float uHmMaxH;      // max field height, physical px (per pass)
  uniform float uHmSurfaceSoft; // soft surface thickness, physical px (per pass)
  uniform float uHmEnv;       // fade envelope (0 -> skip)
  uniform float uHmOpacity;   // master opacity
  uniform float uHmTopFade;   // vertical position where the upper dissolve starts
  uniform float uHmHeatShift; // heatProgress push toward orange/red (0..~0.13)
  uniform vec3 uHmC0;         // palette: low energy (green)
  uniform vec3 uHmC1;         // low-mid (lime)
  uniform vec3 uHmC2;         // mid (yellow)
  uniform vec3 uHmC3;         // high (orange)
  uniform vec3 uHmC4;         // peak (red)
  void main() {
    vec2 p = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y); // y-down
    float ang = radians(152.689);
    vec2 dir = vec2(sin(ang), -cos(ang));
    vec2 center = uResolution * 0.5;
    float halfLen = (abs(uResolution.x * dir.x) + abs(uResolution.y * dir.y)) * 0.5;
    float t = dot(p - center, dir) / (2.0 * halfLen) + 0.5;
    float u = clamp((t - 0.17843) / (0.8303 - 0.17843), 0.0, 1.0);

    // Field influence: soft radial falloff around the pointer/touch (aspect
    // corrected so the radius is circular). Zero when uFieldStrength is 0.
    vec2 suv = p / uResolution;
    vec2 dd = suv - uFieldPos;
    dd.x *= uResolution.x / uResolution.y;
    float infl = uFieldStrength * exp(-dot(dd, dd) / (uFieldRadius * uFieldRadius));

    vec3 col = mix(vec3(44.0, 52.0, 62.0) / 255.0, uDarkStop, u);
    col *= (1.0 + uAudioBg);                    // audio background micro-pulse
    col += uFieldColor * (infl * uFieldGlow);   // subtle field halo

    float bandTop = (uResolution.y - uBandH) * 0.5;
    if (p.y >= bandTop && p.y <= bandTop + uBandH) {
      // Local field distortion of the sampled text: gentle displacement toward
      // the field + a small local scale. Never stops the scroll (uOffset).
      vec2 pc = p;
      vec2 wdir = normalize(dd + 1e-5);
      pc += wdir * (infl * uFieldDisp) * uResolution;
      vec2 centerPx = uFieldPos * uResolution;
      pc = centerPx + (pc - centerPx) * (1.0 + infl * uFieldScale);
      float tx = fract((pc.x + uOffset) / uGroupW);
      float ty = (pc.y - bandTop) / uBandH;
      float a = texture2D(uText, vec2(tx, ty)).a;
      col = mix(col, vec3(1.0), a);
    }

    // --- desktop spectral heatmap: one continuous thermal field ---------------
    // Drawn ON the same opaque background plane (above the marquee, below the
    // monogram, refracted through the glass via the RT). No bars/lines: a
    // LINEAR-sampled, extra-blurred height field with a vertical green->red
    // thermal gradient and a soft undulating top.
    if (uHmEnv > 0.001) {
      float distBottom = uResolution.y - p.y; // physical px from the viewport bottom
      if (distBottom < uHmMaxH + uHmSurfaceSoft * 3.0) {
        float nx = clamp(p.x / uResolution.x, 0.0, 1.0); // 0=low freq .. 1=high freq
        // Continuous energy at nx: LINEAR texture + a small horizontal blur so no
        // single band is recognisable (on top of the JS spatial blur).
        float e =
            texture2D(uHmTex, vec2(nx, 0.5)).r * 0.40
          + texture2D(uHmTex, vec2(clamp(nx - 0.013, 0.0, 1.0), 0.5)).r * 0.24
          + texture2D(uHmTex, vec2(clamp(nx + 0.013, 0.0, 1.0), 0.5)).r * 0.24
          + texture2D(uHmTex, vec2(clamp(nx - 0.030, 0.0, 1.0), 0.5)).r * 0.06
          + texture2D(uHmTex, vec2(clamp(nx + 0.030, 0.0, 1.0), 0.5)).r * 0.06;
        float h = e * uHmMaxH;                              // column height (px)
        float t = clamp(distBottom / uHmMaxH, 0.0, 1.0);    // 0 bottom -> 1 top of band
        // soft undulating surface (no hard top edge, no baseline when h ~ 0)
        float surface = 1.0 - smoothstep(h - uHmSurfaceSoft, h + uHmSurfaceSoft, distBottom);
        float present = smoothstep(uHmSurfaceSoft * 0.2, uHmSurfaceSoft * 0.7, h);
        // vertical thermal gradient by absolute height (red only at tall peaks),
        // nudged toward red by heatProgress without losing the green.
        float ct = clamp(t + uHmHeatShift * smoothstep(0.25, 1.0, t), 0.0, 1.0);
        vec3 c = mix(uHmC0, uHmC1, smoothstep(0.0, 0.22, ct));
        c = mix(c, uHmC2, smoothstep(0.22, 0.42, ct));   // -> yellow
        c = mix(c, uHmC3, smoothstep(0.42, 0.64, ct));   // -> orange
        c = mix(c, uHmC4, smoothstep(0.64, 0.9, ct));    // -> red at tall peaks
        // opacity: master * gentle vertical profile * upper dissolve * energy
        float vProfile = mix(0.85, 1.12, t);
        float upper = 1.0 - smoothstep(uHmTopFade, 1.0, t);
        float energyBoost = 0.62 + 0.38 * e;
        // subtle ordered dither to keep the gradient banding-free
        float dither = (fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.02;
        float alpha = surface * present * uHmOpacity * vProfile * upper * energyBoost * uHmEnv;
        col = mix(col, c, clamp(alpha + dither * alpha, 0.0, 1.0));
      }
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

const MARQUEE_VERTEX = /* glsl */ `
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export default function Monogram({
  initialOpacity = 1,
}: {
  // Route-correct initial canvas opacity (1 Home / 0 internal desktop) so the
  // persistent scene never flashes the fallback on internal direct-load. The
  // portal loop drives it live thereafter.
  initialOpacity?: number;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    // Route-correct initial coverage so the persistent scene is invisible on
    // internal desktop routes from the very first paint (the loop drives it after).
    stage.style.opacity = String(initialOpacity);

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      const { SVGLoader } = await import(
        "three/examples/jsm/loaders/SVGLoader.js"
      );
      const { RoomEnvironment } = await import(
        "three/examples/jsm/environments/RoomEnvironment.js"
      );

      const svgText = await fetch("/assets/svg/monogram.svg").then((r) =>
        r.text(),
      );
      if (disposed) return;

      // --- Scene / camera ----------------------------------------------------
      const scene = new THREE.Scene();
      let vw = window.innerWidth;
      let vh = window.innerHeight;
      const camera = new THREE.OrthographicCamera(
        -vw / 2,
        vw / 2,
        vh / 2,
        -vh / 2,
        -4000,
        4000,
      );
      camera.position.z = 1500;

      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
      });
      renderer.setClearColor(0x000000, 0);
      // Mobile renders at 1.5× device pixels (crisp, but not the full native
      // iPhone DPR of 3 which would be ~4× the fill). Desktop keeps 2. Raising
      // this from the old 1.25 removes the soft/aliased look on iPhone.
      const maxDpr = () => (window.innerWidth <= 767 ? 1.5 : 2);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxDpr()));
      renderer.setSize(vw, vh, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;

      const pmrem = new THREE.PMREMGenerator(renderer);
      const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = envRT.texture;

      // --- Marquee + gradient plane (refraction background) ------------------
      const blankTex = new THREE.DataTexture(
        new Uint8Array([0, 0, 0, 0]),
        1,
        1,
        THREE.RGBAFormat,
      );
      blankTex.needsUpdate = true;

      // Heatmap band-energy data texture (BANDS x 1, R channel), LINEAR filtered
      // so the field is continuous between bands. One reused buffer uploaded per
      // frame — the single visual source for the thermal field (no DOM).
      const hmData = new Uint8Array(HEATMAP.numBands * 4);
      const hmTex = new THREE.DataTexture(
        hmData,
        HEATMAP.numBands,
        1,
        THREE.RGBAFormat,
      );
      hmTex.minFilter = THREE.LinearFilter;
      hmTex.magFilter = THREE.LinearFilter;
      hmTex.wrapS = THREE.ClampToEdgeWrapping;
      hmTex.needsUpdate = true;

      // Desktop: 330px scaled proportionally (=330 at 1728). Mobile: exact 64px.
      const marqueeScale = () =>
        vw <= 767 ? 64 / MARQUEE_FONT_PX : Math.min(1, vw / 1728);
      // The shader reads gl_FragCoord (physical px), so every screen-space
      // uniform must be in physical px too (× the renderer pixel ratio). This
      // keeps the marquee centred at every devicePixelRatio (Retina / mobile).
      const pr = () => renderer.getPixelRatio();
      const marqueeMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uResolution: { value: new THREE.Vector2(vw * pr(), vh * pr()) },
          uText: { value: blankTex },
          uOffset: { value: 0 },
          uGroupW: { value: 1 },
          uBandH: { value: MARQUEE_BAND_H * pr() },
          uDarkStop: { value: new THREE.Vector3(0, 0, 0) },
          uFieldPos: { value: new THREE.Vector2(0.5, 0.5) },
          uFieldStrength: { value: 0 },
          uFieldRadius: { value: FIELD.radius },
          uFieldDisp: { value: 0 },
          uFieldScale: { value: 0 },
          uFieldGlow: { value: 0 },
          uFieldColor: { value: new THREE.Color(0xb0c7fd) },
          uAudioBg: { value: 0 },
          uHmTex: { value: hmTex },
          uHmMaxH: { value: 0 },
          uHmSurfaceSoft: { value: 10 },
          uHmEnv: { value: 0 },
          uHmOpacity: { value: HEATMAP.opacity },
          uHmTopFade: { value: HEATMAP.topFadeStart },
          uHmHeatShift: { value: 0 },
          uHmC0: { value: new THREE.Color().fromArray(HEATMAP.colorLow) },
          uHmC1: { value: new THREE.Color().fromArray(HEATMAP.colorLowMid) },
          uHmC2: { value: new THREE.Color().fromArray(HEATMAP.colorMid) },
          uHmC3: { value: new THREE.Color().fromArray(HEATMAP.colorHigh) },
          uHmC4: { value: new THREE.Color().fromArray(HEATMAP.colorPeak) },
        },
        vertexShader: MARQUEE_VERTEX,
        fragmentShader: MARQUEE_FRAGMENT,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      });
      const marqueePlane = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        marqueeMaterial,
      );
      marqueePlane.position.z = -1200;
      marqueePlane.renderOrder = -1;
      marqueePlane.scale.set(vw, vh, 1);
      scene.add(marqueePlane);

      // Build the scrolling text texture (one group + 64px gap) once fonts load.
      let groupWorldW = 1;
      const buildMarqueeTexture = async () => {
        try {
          await document.fonts?.ready;
        } catch {
          /* ignore */
        }
        if (disposed) return;
        let family = getComputedStyle(document.documentElement)
          .getPropertyValue("--font-clash-display")
          .trim();
        if (!family) family = "'Clash Display', sans-serif";
        const ls = MARQUEE_FONT_PX * MARQUEE_LETTER_SPACING;
        const measure = document.createElement("canvas").getContext("2d")!;
        measure.font = `700 ${MARQUEE_FONT_PX}px ${family}`;
        measure.letterSpacing = `${ls}px`;
        const textW = Math.ceil(measure.measureText(MARQUEE_TEXT).width);
        const groupW = textW + MARQUEE_GAP;
        const cap = 4096;
        const s = groupW > cap ? cap / groupW : 1;
        const cw = Math.max(2, Math.round(groupW * s));
        const ch = Math.max(2, Math.round(MARQUEE_BAND_H * s));
        const c = document.createElement("canvas");
        c.width = cw;
        c.height = ch;
        const ctx = c.getContext("2d")!;
        ctx.scale(s, s);
        ctx.font = `700 ${MARQUEE_FONT_PX}px ${family}`;
        ctx.letterSpacing = `${ls}px`;
        ctx.fillStyle = "#ffffff";
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        ctx.fillText(MARQUEE_TEXT, 0, MARQUEE_BAND_H / 2);
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        // Deterministic orientation: keep texel (0,0) at the canvas top-left so
        // the shader's ty (0 at band top) maps to the top of upright text on
        // every GPU. No flipY / no negative UV / no mirrored geometry.
        tex.flipY = false;
        marqueeMaterial.uniforms.uText.value = tex;
        groupWorldW = groupW;
        marqueeMaterial.uniforms.uGroupW.value = groupW * marqueeScale() * pr();
        marqueeMaterial.uniforms.uBandH.value =
          MARQUEE_BAND_H * marqueeScale() * pr();
        return tex;
      };
      const marqueeTexPromise = buildMarqueeTexture();

      // --- Extruded glass geometry -------------------------------------------
      const svgData = new SVGLoader().parse(svgText);
      const shapes: import("three").Shape[] = [];
      for (const path of svgData.paths) {
        for (const shape of SVGLoader.createShapes(path)) shapes.push(shape);
      }
      const geometry = new THREE.ExtrudeGeometry(shapes, {
        depth: EXTRUDE_DEPTH,
        bevelEnabled: true,
        bevelThickness: BEVEL_THICKNESS,
        bevelSize: BEVEL_SIZE,
        bevelSegments: BEVEL_SEGMENTS,
        curveSegments: 24,
        steps: 1,
      });
      geometry.rotateX(Math.PI);
      geometry.computeBoundingBox();
      const bbox = geometry.boundingBox!;
      geometry.translate(
        -(bbox.max.x + bbox.min.x) / 2,
        -(bbox.max.y + bbox.min.y) / 2,
        -(bbox.max.z + bbox.min.z) / 2,
      );
      geometry.computeBoundingBox();
      const naturalHeight = bbox.max.y - bbox.min.y;

      const isMobile = vw <= 767;
      // Debug toggle: ?glass=legacy forces the legacy transmission material on
      // mobile so legacy vs custom can be compared. Not surfaced in the UI.
      const forceLegacy =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("glass") === "legacy";
      // Custom Liquid Glass runs on BOTH desktop and mobile now (shared
      // pipeline + shader). ?glass=legacy still forces the old material.
      const useCustomGlass = !forceLegacy;

      // Legacy material (only for the ?glass=legacy comparison path).
      const makeLegacyMaterial = () =>
        new THREE.MeshPhysicalMaterial({
          color: 0xb0c7fd,
          metalness: 0.0,
          roughness: isMobile ? 0.14 : 0.16,
          transmission: isMobile ? 0.55 : 0.62,
          thickness: isMobile ? 210 : 180,
          ior: isMobile ? 1.32 : 1.45,
          attenuationColor: new THREE.Color(0xb0c7fd),
          attenuationDistance: isMobile ? 140 : 180,
          dispersion: isMobile ? 0.1 : 0.06,
          clearcoat: isMobile ? 1.0 : 0.9,
          clearcoatRoughness: isMobile ? 0.08 : 0.1,
          specularIntensity: 1.0,
          envMapIntensity: isMobile ? 0.5 : 0.35,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 1,
          depthWrite: true,
        });

      // --- Liquid Glass: real two-pass screen-space refraction ---------------
      // PASS 1 renders background + marquee into a WebGLRenderTarget (monogram
      // hidden). PASS 2 renders the monogram with a custom ShaderMaterial that
      // samples that target with a liquid normal field (works on the flat front
      // face), multi-tap blur, RGB dispersion, navy tint, Fresnel and specular.
      // ONE shader + pipeline; per-viewport values come from a profile. The
      // mobile profile is the approved one (unchanged); desktop is calibrated
      // for the larger viewport.
      const LIQUID_GLASS_PROFILES = {
        mobile: {
          refraction: 0.0384, // was 0.032, +20% optical lensing
          blur: 0.006,
          chroma: 0.006,
          tintStrength: 0.2,
          fresnel: 0.28,
          specular: 0.22,
          rtDpr: 2, // min(pr(),2) === pr() on mobile -> RT tracks the 1.5× canvas
          // TWO stable, high-resolution tiers only (mobile downgrades HIGH ->
          // BALANCED at most once — never to a low-res tier). Both keep the RT
          // at/above the canvas resolution, so the refracted marquee never shows
          // visible pixels and the RGB dispersion stays crisp. The old 0.8/0.68/
          // 0.55 scales (at DPR 1.25) dropped the refraction target below CSS
          // resolution — that was the grainy/pixelated regression on iPhone.
          tiers: {
            high: { rtScale: 1.0, samples: 9, dispersion: 1 }, // HIGH: full effective res
            medium: { rtScale: 0.85, samples: 7, dispersion: 1 }, // BALANCED: moderate, still > CSS res
            fallback: { rtScale: 0.85, samples: 5, dispersion: 1 }, // mobile never selects this; kept for parity
          },
        },
        desktop: {
          refraction: 0.0132, // was 0.011 (~19px @1728) -> +20% (~23px @1728)
          blur: 0.0045, // ~8px @1728
          chroma: 0.0013, // ~2px @1728
          tintStrength: 0.17,
          fresnel: 0.24,
          specular: 0.22,
          rtDpr: 1.25, // cap the RT resolution (main canvas stays crisp at 2)
          tiers: {
            high: { rtScale: 0.9, samples: 9, dispersion: 1 },
            medium: { rtScale: 0.8, samples: 7, dispersion: 1 },
            // Keep the baseline RGB dispersion on the cheapest desktop tier too.
            fallback: { rtScale: 0.65, samples: 5, dispersion: 1 },
          },
        },
      } as const;
      const profile = isMobile
        ? LIQUID_GLASS_PROFILES.mobile
        : LIQUID_GLASS_PROFILES.desktop;
      const GLASS_TIERS = profile.tiers;
      type GlassTier = keyof typeof GLASS_TIERS;
      const glassTierOrder: GlassTier[] = ["high", "medium", "fallback"];

      const GLASS_VERTEX = /* glsl */ `
        varying vec2 vScreenUV;
        varying vec3 vViewNormal;
        varying vec3 vLocalPos;
        void main() {
          vLocalPos = position;
          vViewNormal = normalize(normalMatrix * normal);
          vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          vScreenUV = clip.xy / clip.w * 0.5 + 0.5;
          gl_Position = clip;
        }`;

      // The blur accumulates a base tap (+4 at samples>=5, +4 more at >=9), so
      // the average must divide by the REAL tap count, not the tier's `samples`
      // label. With samples=3 only the base tap exists; dividing by 3 dimmed the
      // fallback to a third of its brightness (a flat, washed-out look on top of
      // the missing dispersion). Divide by taps so every tier is correctly lit.
      const tapCount = (samples: number) =>
        samples >= 9 ? 9 : samples >= 5 ? 5 : 1;
      const glassFragment = (samples: number, dispersion: number) => /* glsl */ `
        precision highp float;
        uniform sampler2D tBackground;
        uniform vec2 uResolution;
        uniform float uTime;
        uniform float uRefractionStrength;
        uniform float uBlurStrength;
        uniform float uChromaticAberration;
        uniform vec3 uTint;
        uniform float uTintStrength;
        uniform float uFresnelStrength;
        uniform float uSpecularStrength;
        uniform vec3 uLightDirection;
        // Frequency Field + Sonic Pulse (all 0 when off -> identical output) -----
        uniform vec2 uFieldPosG;      // normalized, y-up (matches vScreenUV)
        uniform float uFieldStrength;
        uniform float uFieldRadius;
        uniform float uFieldRefract;  // local refraction/dispersion boost
        uniform float uFieldSpec;     // local specular boost
        uniform float uAudioRefract;  // global refraction breath from bass/mid
        uniform float uAudioSpec;     // global specular lift from mids
        // Mobile tactile pressure / liquid touch (all 0 -> identical output) ----
        uniform vec2 uTouchPos;       // y-up screen UV of the finger
        uniform float uTouchActive;   // 0..1 press envelope * intensity
        uniform float uTouchRadius;
        uniform float uTouchDisp;     // inward depression pull
        uniform float uTouchRefract;  // local refraction boost
        uniform float uTouchRgb;      // local RGB separation boost
        uniform float uTouchSpec;     // local specular boost
        uniform vec2 uRippleCenter;
        uniform float uRippleProgress;// 0..1 active, <0 inactive
        uniform float uRippleStrength;
        uniform float uRippleRadiusMax;
        uniform float uRippleWidth;
        uniform float uRippleRefract;
        uniform float uRippleRgb;
        uniform float uRippleSpec;
        uniform float uRippleDisp;
        varying vec2 vScreenUV;
        varying vec3 vViewNormal;
        varying vec3 vLocalPos;

        vec2 waveField(vec2 uv, vec3 lp, float t) {
          float a = sin(uv.x * 8.0 + t * 0.4 + lp.y * 2.5);
          float b = cos(uv.y * 7.0 - t * 0.35 + lp.x * 2.5);
          float c = sin((uv.x + uv.y) * 5.0 + t * 0.22);
          return vec2(a * 0.6 + c * 0.4, b * 0.6 - c * 0.4);
        }

        void main() {
          vec3 N = normalize(vViewNormal);
          vec3 V = vec3(0.0, 0.0, 1.0);

          // Liquid normal field: geometric xy (edges) + a slow procedural wave
          // so the FLAT front face (N.xy ~ 0) still bends the marquee.
          vec2 wave = waveField(vScreenUV, normalize(vLocalPos + 1.0), uTime);
          vec2 refractDir = N.xy + wave * 0.85;

          // Local field lensing + global audio breath -> a multiplier on the
          // refraction & dispersion (1.0 when both are off). Purely additive to
          // the approved base: it only ever increases density near the field.
          vec2 gdd = vScreenUV - uFieldPosG;
          gdd.x *= uResolution.x / uResolution.y;
          float inflG = uFieldStrength * exp(-dot(gdd, gdd) / (uFieldRadius * uFieldRadius));
          float refractMul = 1.0 + inflG * uFieldRefract + uAudioRefract;

          // Tactile liquid touch: a local, temporary depression (an inward lens
          // that pulls the sampling toward the finger) + an expanding ring on
          // release. All terms are 0 when not touching / on desktop.
          vec2 tdd = vScreenUV - uTouchPos;
          tdd.x *= uResolution.x / uResolution.y;
          float ti = uTouchActive * exp(-dot(tdd, tdd) / (uTouchRadius * uTouchRadius));
          float ri = 0.0;
          vec2 rOut = vec2(0.0);
          if (uRippleProgress >= 0.0) {
            vec2 rdd = vScreenUV - uRippleCenter;
            rdd.x *= uResolution.x / uResolution.y;
            float rDist = length(rdd);
            float ringR = uRippleProgress * uRippleRadiusMax;
            ri = exp(-pow((rDist - ringR) / uRippleWidth, 2.0))
              * uRippleStrength * (1.0 - uRippleProgress);
            rOut = normalize(rdd + 1e-5) * (ri * uRippleDisp);
          }
          refractMul += ti * uTouchRefract + ri * uRippleRefract;
          refractDir -= normalize(tdd + 1e-5) * (ti * uTouchDisp); // pull toward finger
          refractDir += rOut;                                       // ripple nudges outward
          float rgbMul = 1.0 + ti * uTouchRgb + ri * uRippleRgb;
          float specTouch = ti * uTouchSpec + ri * uRippleSpec;

          vec2 uv = vScreenUV + refractDir * uRefractionStrength * refractMul;

          float b = uBlurStrength;
          vec3 col = texture2D(tBackground, uv).rgb;
          ${
            samples >= 5
              ? `col += texture2D(tBackground, uv + vec2(b, 0.0)).rgb;
          col += texture2D(tBackground, uv - vec2(b, 0.0)).rgb;
          col += texture2D(tBackground, uv + vec2(0.0, b)).rgb;
          col += texture2D(tBackground, uv - vec2(0.0, b)).rgb;`
              : ``
          }
          ${
            samples >= 9
              ? `col += texture2D(tBackground, uv + vec2(b, b) * 0.7071).rgb;
          col += texture2D(tBackground, uv + vec2(-b, -b) * 0.7071).rgb;
          col += texture2D(tBackground, uv + vec2(b, -b) * 0.7071).rgb;
          col += texture2D(tBackground, uv + vec2(-b, b) * 0.7071).rgb;`
              : ``
          }
          col /= ${tapCount(samples).toFixed(1)};

          ${
            dispersion
              ? `float ca = uChromaticAberration * refractMul * rgbMul;
          col.r = mix(col.r, texture2D(tBackground, uv + refractDir * ca).r, 0.7);
          col.b = mix(col.b, texture2D(tBackground, uv - refractDir * ca).b, 0.7);`
              : ``
          }

          col = mix(col, uTint, uTintStrength);

          float fres = pow(1.0 - clamp(N.z, 0.0, 1.0), 3.0) * uFresnelStrength;
          col += fres * vec3(0.45, 0.6, 1.0);

          vec3 L = normalize(uLightDirection);
          vec3 H = normalize(L + V);
          float spec = pow(max(dot(N, H), 0.0), 48.0) * uSpecularStrength
            * (1.0 + inflG * uFieldSpec + uAudioSpec + specTouch);
          col += spec * vec3(1.0);

          gl_FragColor = vec4(col, 1.0);
        }`;

      let currentTier: GlassTier = renderer.capabilities.isWebGL2
        ? "high"
        : "medium";
      let rt: import("three").WebGLRenderTarget | null = null;
      let glassShader: import("three").ShaderMaterial | null = null;

      const rtDpr = () => Math.min(pr(), profile.rtDpr);
      const makeRT = (tier: GlassTier) => {
        const s = GLASS_TIERS[tier].rtScale;
        const w = Math.max(2, Math.round(vw * rtDpr() * s));
        const h = Math.max(2, Math.round(vh * rtDpr() * s));
        const target = new THREE.WebGLRenderTarget(w, h, {
          depthBuffer: false,
          stencilBuffer: false,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
        });
        return target;
      };

      const makeGlassShader = (tier: GlassTier) => {
        const cfg = GLASS_TIERS[tier];
        return new THREE.ShaderMaterial({
          uniforms: {
            tBackground: { value: rt!.texture },
            uResolution: { value: new THREE.Vector2(vw, vh) },
            uTime: { value: 0 },
            uRefractionStrength: { value: profile.refraction },
            uBlurStrength: { value: profile.blur },
            uChromaticAberration: { value: profile.chroma },
            uTint: { value: new THREE.Color(0xb0c7fd) },
            uTintStrength: { value: profile.tintStrength },
            uFresnelStrength: { value: profile.fresnel },
            uSpecularStrength: { value: profile.specular },
            uLightDirection: {
              value: new THREE.Vector3(0.3, 0.5, 1.0).normalize(),
            },
            uFieldPosG: { value: new THREE.Vector2(0.5, 0.5) },
            uFieldStrength: { value: 0 },
            uFieldRadius: { value: FIELD.radius },
            uFieldRefract: { value: 0 },
            uFieldSpec: { value: 0 },
            uAudioRefract: { value: 0 },
            uAudioSpec: { value: 0 },
            uTouchPos: { value: new THREE.Vector2(0.5, 0.5) },
            uTouchActive: { value: 0 },
            uTouchRadius: { value: TACTILE.radius },
            uTouchDisp: { value: 0 },
            uTouchRefract: { value: 0 },
            uTouchRgb: { value: 0 },
            uTouchSpec: { value: 0 },
            uRippleCenter: { value: new THREE.Vector2(0.5, 0.5) },
            uRippleProgress: { value: -1 },
            uRippleStrength: { value: 0 },
            uRippleRadiusMax: { value: TACTILE.rippleMaxRadius },
            uRippleWidth: { value: TACTILE.rippleWidth },
            uRippleRefract: { value: 0 },
            uRippleRgb: { value: 0 },
            uRippleSpec: { value: 0 },
            uRippleDisp: { value: 0 },
            uQualityTier: { value: glassTierOrder.indexOf(tier) },
          },
          vertexShader: GLASS_VERTEX,
          fragmentShader: glassFragment(cfg.samples, cfg.dispersion),
          side: THREE.DoubleSide,
          transparent: false,
          depthWrite: true,
        });
      };

      let meshMaterial: import("three").Material;
      if (useCustomGlass) {
        rt = makeRT(currentTier);
        glassShader = makeGlassShader(currentTier);
        meshMaterial = glassShader;
      } else {
        meshMaterial = makeLegacyMaterial();
      }
      const mesh = new THREE.Mesh(geometry, meshMaterial);
      scene.add(mesh);

      // --- Portal cavity target marker (debug only) --------------------------
      // Small dot at the aim point, shown ONLY with ?debugEffects=1 + TARGET on.
      const portalMarker = new THREE.Mesh(
        new THREE.SphereGeometry(7, 16, 16),
        new THREE.MeshBasicMaterial({
          color: 0xff0044,
          depthTest: false,
          transparent: true,
          opacity: 0.9,
          toneMapped: false,
        }),
      );
      portalMarker.renderOrder = 999;
      portalMarker.visible = false;
      scene.add(portalMarker);

      // --- Thermal (chromatic) state -----------------------------------------
      // ONE reusable colour is lerped between cold and hot in HSL, so the sweep
      // travels blue -> violet -> pink -> red (no dirty greys). `heat` is the
      // linear 0..1 thermal level; a smoothstep eases it before it drives the
      // colour and the tint weight. No per-frame allocation: COLD/HOT/heatColor
      // are created once and copied into. The custom liquid glass has no literal
      // opacity (it is an opaque refractive solid) — the visual weight of its
      // navy/red tint is uTintStrength, so we scale that from its base (the 11%
      // look) to ~2x (the 22% look) as it heats, leaving refraction untouched.
      // Near max heat the monogram also frosts: we widen ONLY its own refraction
      // blur (uBlurStrength) — a per-material uniform on the monogram fragments,
      // so the marquee/background (a separate material) stay perfectly sharp.
      const COLD = new THREE.Color(HEAT_HEX_COLD);
      const HOT = new THREE.Color(HEAT_HEX_HOT);
      const heatColor = new THREE.Color(HEAT_HEX_COLD);
      // Background heat — the gradient's dark (second) stop travels #000000 ->
      // #580001 (rgb 88,0,1), driven by the SAME eased heat as the monogram. The
      // visible Home background IS the WebGL marquee (it covers the body), so we
      // heat ONLY its shader uniform — no per-frame CSS write, which used to
      // repaint the full-screen fixed body gradient (a compositor cost behind
      // the marquee) and allocate a string every heated frame. The CSS var is
      // reset to base on cleanup so any non-WebGL route/fallback stays neutral.
      const HEAT_DARK_R = 88;
      const HEAT_DARK_B = 1;
      const rootStyle = document.documentElement.style;
      const baseTint = profile.tintStrength;
      const baseBlur = profile.blur; // liquid-glass base; frost adds on top
      // RGB dispersion is split into a permanent baseline and a heat-driven
      // boost:  finalChroma = baseChroma + eased * CHROMA_BOOST.  The baseline is
      // never touched by heat/cool/scroll/glitch, so the liquid-glass colour
      // separation is always present; cooling only unwinds the boost back DOWN
      // to the baseline (never to zero).
      const baseChroma = profile.chroma; // permanent floor, > 0
      const CHROMA_BOOST = profile.chroma * 1.5; // extra separation at full heat
      let heat = 0; // 0..1 linear thermal level
      let appliedHeat = -1; // last heat written to the material (skips redundant work)
      // Heat-applied blur/chroma bases — the portal dive adds transient
      // refraction/blur/dispersion ON TOP of these each frame (reset when idle).
      let heatBlurBase = baseBlur;
      let heatChromaBase = baseChroma;
      const smoothstep01 = (x: number) => x * x * (3 - 2 * x);
      const applyHeat = () => {
        if (heat === appliedHeat) return;
        appliedHeat = heat;
        const eased = smoothstep01(heat); // smooth colour + opacity
        heatColor.copy(COLD).lerpHSL(HOT, eased);
        // Background dark stop tracks the same eased heat (#000 -> #580001) via
        // the marquee shader uniform only (no allocation, no CSS repaint).
        marqueeMaterial.uniforms.uDarkStop.value.set(
          (HEAT_DARK_R * eased) / 255,
          0,
          (HEAT_DARK_B * eased) / 255,
        );
        // Frost ramps in only over BLUR_START..1, smoothly.
        const frost = smoothstep01(
          Math.min(1, Math.max(0, (heat - BLUR_START) / (1 - BLUR_START))),
        );
        if (useCustomGlass && glassShader) {
          glassShader.uniforms.uTint.value.copy(heatColor);
          // 11% look -> ~22% look: double the tint's visual weight at full heat.
          glassShader.uniforms.uTintStrength.value = baseTint * (1 + eased);
          // Blur ONLY the monogram's own optical content (its refraction taps).
          heatBlurBase = baseBlur + frost * BLUR_MAX_ADD;
          glassShader.uniforms.uBlurStrength.value = heatBlurBase;
          // Dynamic RGB boost rides on top of the always-on baseline; when heat
          // decays the boost unwinds to baseChroma, so the separation persists.
          heatChromaBase = baseChroma + eased * CHROMA_BOOST;
          glassShader.uniforms.uChromaticAberration.value = heatChromaBase;
        } else if (!useCustomGlass) {
          const m = meshMaterial as import("three").MeshPhysicalMaterial;
          m.color.copy(heatColor);
          m.attenuationColor.copy(heatColor);
        }
      };

      // --- RGB glitch ghosts (children of the mesh) --------------------------
      const glitchColors = [0xff2233, 0x22ff44, 0x2244ff];
      const glitchMats: import("three").MeshBasicMaterial[] = [];
      const glitchGhosts: import("three").Mesh[] = [];
      for (const color of glitchColors) {
        const gm = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.5,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          depthTest: true,
          side: THREE.DoubleSide,
          toneMapped: false,
        });
        const ghost = new THREE.Mesh(geometry, gm);
        ghost.visible = false;
        ghost.renderOrder = 2;
        mesh.add(ghost);
        glitchMats.push(gm);
        glitchGhosts.push(ghost);
      }
      let glitchStart = 0;

      // Base uniform scale from the fit; Sonic Pulse multiplies this per frame
      // (mesh.scale = baseScaleValue * (1 + audioScale)). Also the on-screen
      // vertical centre of the monogram (0..1, y-down) used to aim the parallax.
      let baseScaleValue = 1;
      let monoCenterY = 0.5;
      const applyFit = () => {
        if (vw <= 767) {
          // Mobile: ~467px tall near the top (Figma), so the marquee reads on
          // the sides. Proportional to height; centred horizontally.
          const targetH = Math.min(vh * 0.575, vh - 240);
          baseScaleValue = targetH / naturalHeight;
          mesh.scale.setScalar(baseScaleValue);
          mesh.position.y = vh / 2 - (vh * 0.15 + targetH / 2); // top ~122@812
        } else {
          baseScaleValue = (vh - MARGIN * 2) / naturalHeight;
          mesh.scale.setScalar(baseScaleValue);
          mesh.position.y = 0;
        }
        // world y -> normalized screen y (y-down): screen top = vh/2.
        monoCenterY = 0.5 - mesh.position.y / vh;
      };
      applyFit();

      // --- Frequency Field state (pointer/touch) -----------------------------
      // Damped, frame-rate-independent field. Position eases toward the pointer;
      // strength ramps on movement and decays to 0 (~decayMs) when it holds
      // still. Everything is 0 when the flag is off or under reduced motion.
      // Reduced motion disables it entirely (static); the ENABLE flag is read
      // LIVE every frame so the debug panel can toggle it at runtime.
      const fieldAllowed = !prefersReducedMotion;
      let fieldTX = 0.5;
      let fieldTY = 0.5; // target (y-down, normalized)
      let fieldX = 0.5;
      let fieldY = 0.5; // damped
      let fieldStrength = 0; // 0..1
      let fieldLastX = 0.5;
      let fieldLastY = 0.5;
      let scrollRotY = mesh.rotation.y; // authoritative scroll/inertia rotation
      let fpsSmooth = 60;

      // --- Tactile pressure / liquid touch state (mobile only) ---------------
      // A single press + ripple at a time. Reused raycaster/vectors, no per-frame
      // allocation. All uniform offsets are local + temporary.
      const raycaster = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      const touchUV = new THREE.Vector2(0.5, 0.5); // y-up screen UV of the finger
      const rippleUV = new THREE.Vector2(0.5, 0.5);
      let tacCandidate = false; // touched the monogram, waiting to activate
      let tacActive = false; // press recognised (held long enough, still)
      let tacStartX = 0;
      let tacStartY = 0;
      let tacStartTime = 0;
      let pressStrength = 0; // 0..1 press envelope
      let holdRefract = 0; // 0..1 hold-refraction ramp
      let rippleActive = false;
      let rippleStart = 0;
      let rippleDurMs = TACTILE.rippleDurationMs;
      let rippleScale = 1; // full press vs small tap
      const hapticSupported =
        typeof navigator !== "undefined" && "vibrate" in navigator;
      telemetry.tacHapticSupported = hapticSupported;

      // --- Loop (continuous: the marquee scrolls every frame) ----------------
      let angularVelocity = 0; // rad/s
      let lastInputTime = -Infinity; // performance.now() of the last scroll/drag
      let rafId = 0;
      let lastFrame = performance.now();
      let marqueeOffsetFrac = 0; // 0..1, resolution-independent scroll phase
      // Portal coverage state (avoid per-frame DOM writes / redundant work).
      let portalLastPresence = -1;
      let portalLastActive = false;

      // Set the marquee uniforms for a given target resolution + scale so PASS 1
      // (render target) and PASS 2 (screen) produce an IDENTICAL normalised
      // marquee — the refracted copy stays aligned with the direct one.
      // Resolution-normalised: the marquee layout is the same fraction of the
      // buffer at ANY size/dpr, so PASS 1 (RT, capped dpr) and PASS 2 (screen,
      // dpr 2) stay perfectly aligned. Identical output to before on mobile.
      // Field max height in CSS px per breakpoint. Desktop: the runtime
      // 60/80/100px config. Mobile: responsive clamp(56px, 10dvh, 100px) — vh is
      // the live viewport height (updated on resize / dynamic Safari toolbars).
      const heatmapMaxCssPx = () =>
        isMobile
          ? Math.max(
              HEATMAP.mobileMinHeightPx,
              Math.min(HEATMAP.mobileMaxHeightPx, vh * HEATMAP.mobileHeightVh),
            )
          : HEATMAP.maxHeightPx;

      const setMarqueeUniforms = (resW: number, resH: number) => {
        const u = marqueeMaterial.uniforms;
        u.uResolution.value.set(resW, resH);
        u.uGroupW.value = ((groupWorldW * marqueeScale()) / vw) * resW;
        u.uBandH.value = ((MARQUEE_BAND_H * marqueeScale()) / vh) * resH;
        u.uOffset.value = marqueeOffsetFrac * (u.uGroupW.value as number);
        // Heatmap sizes are physical px, so they must scale with THIS pass's
        // resolution to render + refract identically. Strongly reduced under
        // prefers-reduced-motion.
        const rmScale = prefersReducedMotion ? 0.2 : 1;
        u.uHmMaxH.value = ((heatmapMaxCssPx() * rmScale) / vh) * resH;
        u.uHmSurfaceSoft.value = Math.max(2, (HEATMAP.surfaceSoftPx / vh) * resH);
      };

      const renderFrame = () => {
        if (useCustomGlass && rt && glassShader) {
          // PASS 1 — background + marquee into the RT (monogram hidden)
          setMarqueeUniforms(rt.width, rt.height);
          mesh.visible = false;
          renderer.setRenderTarget(rt);
          renderer.render(scene, camera);
          renderer.setRenderTarget(null);
          mesh.visible = true;
          // PASS 2 — full scene; the monogram refracts the RT
          setMarqueeUniforms(vw * pr(), vh * pr());
          renderer.render(scene, camera);
        } else {
          setMarqueeUniforms(vw * pr(), vh * pr());
          renderer.render(scene, camera);
        }
      };

      // Rebuild shader + RT for a new quality tier (rare — measured once).
      const applyGlassTier = (tier: GlassTier) => {
        if (!useCustomGlass || tier === currentTier) return;
        currentTier = tier;
        const oldShader = glassShader;
        const oldRT = rt;
        rt = makeRT(tier);
        glassShader = makeGlassShader(tier);
        glassShader.uniforms.uResolution.value.set(vw, vh);
        mesh.material = glassShader;
        appliedHeat = -1; // new shader reset uTint/uTintStrength — reapply heat
        oldShader?.dispose();
        oldRT?.dispose();
      };
      // Frame-time monitor: after ~80 frames, downgrade once if too slow.
      let perfAccum = 0;
      let perfFrames = 0;
      let tierLocked = !useCustomGlass;

      const updateGlitch = (now: number) => {
        if (glitchStart === 0) return;
        const t = (now - glitchStart) / GLITCH_DURATION_MS;
        if (t >= 1) {
          for (const ghost of glitchGhosts) {
            ghost.visible = false;
            ghost.position.set(0, 0, 0);
            ghost.rotation.z = 0;
          }
          glitchStart = 0;
          return;
        }
        const envelope = Math.sin(t * Math.PI);
        const pulse = Math.sin(t * Math.PI * 3);
        const amp = (4 + 6 * Math.abs(pulse)) * envelope;
        glitchGhosts[0].position.set(amp, amp * 0.15, 0.5);
        glitchGhosts[0].rotation.z = 0.012 * pulse;
        glitchGhosts[1].position.set(amp * 0.12 * pulse, amp * 0.5, 0.5);
        glitchGhosts[1].rotation.z = -0.006 * pulse;
        glitchGhosts[2].position.set(-amp, -amp * 0.15, 0.5);
        glitchGhosts[2].rotation.z = -0.012 * pulse;
        for (const gm of glitchMats) gm.opacity = 0.5 * envelope;
      };

      const loop = (now: number) => {
        // Clamp dt to [0, 64]ms. The MAX guards long stalls; the MIN guards a
        // NEGATIVE gap — the first rAF timestamp after a route remount can be
        // earlier than the performance.now() captured when the loop was armed,
        // and a negative dt would run the heat COOLDOWN in reverse (heating the
        // monogram on mount) and jump the marquee/rotation backwards.
        const dt = Math.min(64, Math.max(0, now - lastFrame));
        lastFrame = now;
        const dtSec = dt / 1000;

        // marquee scroll phase (right -> left), resolution-independent + seamless
        marqueeOffsetFrac = (marqueeOffsetFrac + dt / MARQUEE_CYCLE_MS) % 1;

        // --- Rotation inertia (frame-rate independent) -----------------------
        // Priority 1: scroll/inertia is authoritative and accumulates here; the
        // Frequency Field only adds a small parallax offset below, never touches
        // scrollRotY or the velocity.
        scrollRotY += angularVelocity * dtSec;
        angularVelocity *= Math.exp(-DAMPING_RATE * dtSec); // exponential friction
        if (angularVelocity > MAX_ANGULAR_VELOCITY)
          angularVelocity = MAX_ANGULAR_VELOCITY;
        else if (angularVelocity < -MAX_ANGULAR_VELOCITY)
          angularVelocity = -MAX_ANGULAR_VELOCITY;
        if (Math.abs(angularVelocity) < STOP_THRESHOLD) angularVelocity = 0;

        // --- Thermal heating / cooldown --------------------------------------
        // Heating while scrolling is continuous; hold the level while coasting
        // on inertia; cool only once the rotation has truly stopped. Disabled
        // under reduced motion (stays cold/readable).
        if (!prefersReducedMotion) {
          const scrolling = now - lastInputTime < SCROLL_CONTINUITY_MS;
          if (scrolling) {
            // Accumulate heat in proportion to the REAL scroll intensity: a fast
            // sustained scroll (speedFactor -> 1) reaches full heat in 2s; a slow
            // scroll only warms partially; a brief impulse barely moves it.
            const speedFactor = Math.min(
              1,
              Math.abs(angularVelocity) / HEAT_FULL_SPEED,
            );
            heat = Math.min(1, heat + (dt / HEAT_DURATION_MS) * speedFactor);
          } else if (angularVelocity === 0) {
            heat = Math.max(0, heat - dt / COOLDOWN_DURATION_MS);
          }
          applyHeat();
        }

        updateGlitch(now);

        // animate the liquid refraction (frozen under reduced motion)
        if (glassShader && !prefersReducedMotion) {
          glassShader.uniforms.uTime.value = now * 0.001;
        }

        // --- Sonic Pulse: drive the single audio engine + read the bands ------
        // The Monogram loop is the one rAF driver while it is mounted.
        audioTick(dtSec);
        // --- Portal transition: transient dive offsets (idle on mobile / when
        // inactive). Read ONCE per frame; it attenuates field/sonic, dives the
        // camera, boosts refraction and drives the canvas coverage below.
        const pv = portalVisual();
        const portalActive = getPortalState().active;
        const pulseOn = EFFECTS.ENABLE_SONIC_PULSE && !prefersReducedMotion;
        const bands = pulseOn
          ? getAudioBands()
          : { bass: 0, mid: 0, high: 0 };

        // --- Frequency Field: damped position + decaying strength -------------
        const fieldActive = fieldAllowed && EFFECTS.ENABLE_FREQUENCY_FIELD;
        if (fieldActive) {
          fieldX += (fieldTX - fieldX) * (1 - Math.exp(-FIELD.pointerDamping * dtSec));
          fieldY += (fieldTY - fieldY) * (1 - Math.exp(-FIELD.pointerDamping * dtSec));
          fieldStrength *= Math.exp((-dtSec * 1000) / FIELD.decayMs);
          if (fieldStrength < 0.0008) fieldStrength = 0;
        } else if (fieldStrength !== 0) {
          fieldStrength = 0; // settle to base immediately when disabled
        }
        const sEff =
          fieldStrength *
          (isMobile ? FIELD.mobileStrength : FIELD.desktopStrength) *
          pv.fieldAtten; // portal attenuates the Frequency Field during a dive

        // --- Compose additive offsets (§3) ------------------------------------
        // finalValue = base + heatOffset + fieldOffset + audioOffset. Audio
        // offsets scale by the per-breakpoint runtime intensity (desktop 2.5x /
        // mobile 1.75x) and are hard-clamped per effect (lower ceilings on
        // mobile); 0 when the pulse is off / paused (bands -> 0).
        const bp = isMobile ? PULSE.mobile : PULSE.desktop;
        const si = (pulseOn ? bp.intensity : 0) * pv.sonicAtten;
        const audioRefract = Math.min(
          bp.refractClamp,
          (bands.bass * 0.5 + bands.mid * 0.5) * PULSE.refractPulseBase * si,
        );
        const audioBg = Math.min(bp.bgClamp, bands.bass * PULSE.bgPulseBase * si);
        const audioScale = Math.min(
          bp.scaleClamp,
          bands.bass * PULSE.scalePulseBase * si,
        );
        const audioSpec = Math.min(
          bp.specClamp,
          bands.mid * PULSE.specPulseBase * si,
        );
        const audioDepth = Math.min(
          bp.depthClamp,
          bands.bass * PULSE.depthBase * si,
        );

        // Monogram: scroll rotation (authoritative) + tiny field parallax.
        const maxRad = (FIELD.monogramRotMaxDeg * Math.PI) / 180;
        const parYaw = Math.max(
          -CLAMP.parallaxRad,
          Math.min(CLAMP.parallaxRad, (fieldX - 0.5) * 2 * maxRad * sEff),
        );
        const parPitch = Math.max(
          -CLAMP.parallaxRad,
          Math.min(CLAMP.parallaxRad, -(fieldY - monoCenterY) * 2 * maxRad * sEff),
        );
        mesh.rotation.y = scrollRotY + parYaw;
        mesh.rotation.x = parPitch;
        // During a tactile hold, ease the Sonic-Pulse SCALE contribution down a
        // little so the summed monogram scale stays safe (audio analysis + the
        // heatmap are NOT reduced). pressStrength is last frame's value.
        const scalePulse = audioScale * (1 - 0.4 * pressStrength);
        // Portal dive adds a transient scale boost so the glass fills the
        // viewport at the cover peak (guaranteed opaque by the marquee plane).
        mesh.scale.setScalar(baseScaleValue * (1 + scalePulse) * (1 + pv.scaleBoost));
        mesh.position.z = audioDepth; // bass "mass" push (ortho -> subtle)

        // --- Portal camera dive (ortho zoom + pan toward the cavity) ----------
        // Simulated dive: magnify with camera.zoom and pan toward the aim point.
        // Ortho => the camera never translates THROUGH geometry (no clipping).
        // Idle (mobile / inactive) => zoom 1, pan 0 → base camera untouched.
        if (camera.zoom !== pv.zoom) {
          camera.zoom = pv.zoom;
          camera.updateProjectionMatrix();
        }
        camera.position.x = pv.panX * naturalHeight * baseScaleValue;
        camera.position.y = pv.panY * naturalHeight * baseScaleValue;

        // Marquee uniforms (Frequency Field distortion + glow + audio bg pulse).
        {
          const mu = marqueeMaterial.uniforms;
          mu.uFieldStrength.value = sEff;
          (mu.uFieldPos.value as import("three").Vector2).set(fieldX, fieldY);
          mu.uFieldDisp.value =
            ((isMobile
              ? FIELD.marqueeDispMaxPxMobile
              : FIELD.marqueeDispMaxPxDesktop) /
              vw) *
            sEff;
          mu.uFieldScale.value = FIELD.marqueeScaleMax * sEff;
          mu.uFieldGlow.value = Math.min(CLAMP.bgGlow, FIELD.bgGlowMax) * sEff;
          (mu.uFieldColor.value as import("three").Color).copy(heatColor);
          mu.uAudioBg.value = audioBg;
        }
        // Glass uniforms (local refraction/specular lensing + audio breath).
        if (glassShader) {
          const gu = glassShader.uniforms;
          gu.uFieldStrength.value = sEff;
          (gu.uFieldPosG.value as import("three").Vector2).set(
            fieldX,
            1 - fieldY,
          );
          gu.uFieldRefract.value = FIELD.refractionBoostMax;
          gu.uFieldSpec.value = FIELD.specularBoostMax;
          gu.uAudioRefract.value = audioRefract;
          gu.uAudioSpec.value = audioSpec;
          // Portal dive: transient refraction/blur/dispersion ON TOP of the
          // heat-applied bases (refractMul 1 / adds 0 when idle → base restored).
          gu.uRefractionStrength.value = profile.refraction * pv.refractMul;
          gu.uBlurStrength.value = heatBlurBase + pv.blurAdd;
          gu.uChromaticAberration.value = heatChromaBase + pv.dispAdd;
        }

        // --- Tactile pressure / liquid touch (mobile) -------------------------
        // Recognise the press in the SAME loop (no timer): a held candidate
        // becomes active after holdActivationMs. Envelopes are dt-based; the
        // ripple is pure shader math (origin + progress). Never touches heat /
        // rotation / scroll. Everything settles to 0 when idle / on desktop.
        if (
          tacCandidate &&
          !tacActive &&
          now - tacStartTime >= TACTILE.holdActivationMs
        ) {
          tacActive = true; // press-in recognised
        }
        const pressTarget = tacActive ? 1 : 0;
        const pRate = pressTarget ? TACTILE.pressAttackRate : TACTILE.pressReleaseRate;
        pressStrength += (pressTarget - pressStrength) * (1 - Math.exp(-pRate * dtSec));
        if (pressStrength < 0.0005 && !pressTarget) pressStrength = 0;
        if (tacActive) {
          holdRefract = Math.min(1, holdRefract + (dtSec * 1000) / TACTILE.holdToMaxMs);
        } else {
          holdRefract *= Math.exp(-TACTILE.holdReleaseRate * dtSec);
          if (holdRefract < 0.0005) holdRefract = 0;
        }
        let rippleProg = -1;
        if (rippleActive) {
          rippleProg = (now - rippleStart) / rippleDurMs;
          if (rippleProg >= 1) {
            rippleActive = false;
            rippleProg = -1;
          }
        }
        if (glassShader) {
          const gu = glassShader.uniforms;
          const rmScale = prefersReducedMotion ? TACTILE.reducedMotionScale : 1;
          const pI = TACTILE.pressureIntensity * rmScale;
          const active = pressStrength * pI;
          gu.uTouchActive.value = active;
          (gu.uTouchPos.value as import("three").Vector2).copy(touchUV);
          gu.uTouchRadius.value = TACTILE.radius;
          gu.uTouchDisp.value = TACTILE.dispMax * (0.5 + 0.5 * holdRefract);
          gu.uTouchRefract.value = TACTILE.refractMax * (0.4 + 0.6 * holdRefract);
          gu.uTouchRgb.value = TACTILE.rgbMax * holdRefract;
          gu.uTouchSpec.value = TACTILE.specMax * holdRefract;
          const rI = TACTILE.rippleIntensity * rmScale * rippleScale;
          (gu.uRippleCenter.value as import("three").Vector2).copy(rippleUV);
          gu.uRippleProgress.value = rippleActive ? rippleProg : -1;
          gu.uRippleStrength.value = rippleActive ? rI : 0;
          gu.uRippleRefract.value = TACTILE.rippleRefractMax;
          gu.uRippleRgb.value = TACTILE.rippleRgbMax;
          gu.uRippleSpec.value = TACTILE.rippleSpecMax;
          gu.uRippleDisp.value = TACTILE.rippleDispMax;
          telemetry.tacPressStrength = active;
          telemetry.tacRefractBoost = TACTILE.refractMax * (0.4 + 0.6 * holdRefract) * active;
          telemetry.tacRippleProgress = rippleActive ? rippleProg : -1;
          telemetry.tacRippleRadius = rippleActive ? rippleProg * TACTILE.rippleMaxRadius : 0;
          telemetry.tacActive = tacActive;
          telemetry.tacCandidate = tacCandidate;
          telemetry.tacHoldMs = tacActive ? now - tacStartTime : 0;
        }

        // --- Continuous spectral heatmap (thermal field) ---------------------
        // Desktop (>=1024px) is fed LIVE by the AnalyserNode; MOBILE is fed by
        // the precomputed spectrum (getAudioEnv/getAudioHeatmap are already
        // mode-aware and do NOT depend on the AudioContext). Same shader path:
        // the band energies go to the reused LINEAR DataTexture, drawn on the
        // background plane and refracted through the glass via the RT.
        {
          const mu = marqueeMaterial.uniforms;
          const hmOn =
            EFFECTS.ENABLE_DESKTOP_SPECTRAL_HEATMAP &&
            (isMobile || vw >= HEATMAP.minWidthPx);
          const hmEnv = hmOn ? getAudioEnv() : 0;
          mu.uHmEnv.value = hmEnv;
          const hmMaxCss = heatmapMaxCssPx();
          if (hmEnv > 0.001) {
            const field = getAudioHeatmap();
            for (let i = 0; i < HEATMAP.numBands; i++) {
              hmData[i * 4] = Math.min(255, field[i] * HEATMAP.intensity * 255);
            }
            hmTex.needsUpdate = true;
            mu.uHmOpacity.value = isMobile
              ? HEATMAP.mobileOpacity
              : HEATMAP.opacity;
            mu.uHmTopFade.value = HEATMAP.topFadeStart;
            // heatProgress nudges the palette toward red WITHOUT killing the green.
            mu.uHmHeatShift.value = smoothstep01(heat) * HEATMAP.heatShift;
          }
          telemetry.hmIntensity = HEATMAP.intensity;
          telemetry.hmMaxCfg = hmMaxCss;
          telemetry.hmSmoothing = HEATMAP.smoothing;
          telemetry.hmOpacity = isMobile ? HEATMAP.mobileOpacity : HEATMAP.opacity;
          telemetry.hmMounted = hmOn;
          telemetry.hmHeightPx = hmMaxCss;
          telemetry.hmRenderOrder = marqueePlane.renderOrder;
          telemetry.hmMaxHeightPx = telemetry.hmPeak * hmMaxCss * HEATMAP.intensity;
        }

        // Debug telemetry (read by the ?debugEffects=1 panel; not visual).
        fpsSmooth = fpsSmooth * 0.92 + (dtSec > 0 ? 1 / dtSec : 60) * 0.08;
        telemetry.fieldStrength = sEff;
        telemetry.bgOffset = audioBg;
        telemetry.refractOffset = audioRefract;
        telemetry.monoScale = 1 + audioScale;
        telemetry.heat = heat;
        telemetry.dpr = pr();
        telemetry.fps = fpsSmooth;

        // --- Portal coverage: drive the canvas opacity (presence) + raise it
        // above the UI while a transition runs. Guaranteed-opaque scene (marquee
        // plane) at presence 1 hides the route swap with no flash. Only written
        // on change (no per-frame DOM thrash).
        if (pv.presence !== portalLastPresence) {
          portalLastPresence = pv.presence;
          stage.style.opacity = pv.presence.toFixed(3);
        }
        if (portalActive !== portalLastActive) {
          portalLastActive = portalActive;
          stage.style.zIndex = portalActive ? "40" : "";
        }
        telemetry.portalPresence = pv.presence;
        telemetry.portalRefractBoost = pv.refractMul;
        telemetry.portalCamZoom = pv.zoom;
        telemetry.portalCamX = camera.position.x;
        telemetry.portalCamY = camera.position.y;

        // Debug cavity marker at the aim point (desktop; only when toggled on).
        portalMarker.visible = PORTAL.showTargetMarker && !isMobile;
        if (portalMarker.visible) {
          portalMarker.position.set(
            PORTAL.aimX * naturalHeight * baseScaleValue,
            PORTAL.aimY * naturalHeight * baseScaleValue,
            EXTRUDE_DEPTH,
          );
        }

        // Skip the GPU render when the scene is fully hidden AND idle (internal
        // desktop routes at rest) — the loop + audioTick keep running so the
        // marquee phase / player bar stay live and never jump on resume.
        if (!(pv.presence < 0.004 && !portalActive)) renderFrame();

        // one-time tier downgrade from measured average frame time
        if (!tierLocked) {
          perfAccum += dt;
          perfFrames++;
          if (perfFrames >= 80) {
            const avg = perfAccum / perfFrames;
            tierLocked = true;
            if (isMobile) {
              // Mobile: at most ONE stable step, HIGH -> BALANCED. Never a
              // low-res fallback, and it locks (tierLocked) so it cannot
              // oscillate. Both tiers keep the refraction crisp.
              if (avg > 24 && currentTier === "high") applyGlassTier("medium");
            } else {
              // Desktop behaviour is unchanged.
              if (avg > 26) applyGlassTier("fallback");
              else if (avg > 20 && currentTier === "high") applyGlassTier("medium");
            }
          }
        }

        rafId = requestAnimationFrame(loop);
      };

      // --- Glitch scheduler --------------------------------------------------
      const glitchTimers: ReturnType<typeof setTimeout>[] = [];
      const triggerGlitch = () => {
        // No random RGB glitch during the portal transition.
        if (getPortalState().active) return;
        glitchStart = performance.now();
        for (const ghost of glitchGhosts) ghost.visible = true;
      };
      const scheduleCycle = () => {
        for (const t of GLITCH_TIMES_MS)
          glitchTimers.push(setTimeout(triggerGlitch, t));
        glitchTimers.push(setTimeout(scheduleCycle, GLITCH_CYCLE_MS));
      };
      if (!prefersReducedMotion) scheduleCycle();

      // --- Wheel -> cumulative Y rotation (never scrolls the page) ------------
      const normalizeWheel = (e: WheelEvent) => {
        let delta = e.deltaY;
        if (e.deltaMode === 1) delta *= 16;
        else if (e.deltaMode === 2) delta *= window.innerHeight;
        return Math.max(-120, Math.min(120, delta));
      };
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        // During a portal dive, ignore wheel → no new rotation inertia.
        if (getPortalState().active) return;
        const nd = normalizeWheel(e);
        if (prefersReducedMotion) {
          // No prolonged inertia under reduced motion: a small direct nudge.
          scrollRotY += nd * REDUCED_MOTION_ROTATE;
          return;
        }
        // Impulse: a fast scroll adds more; opposite scroll brakes then reverses;
        // a scroll mid-decel stacks on the surviving velocity.
        lastInputTime = performance.now();
        angularVelocity += nd * IMPULSE_STRENGTH;
        if (angularVelocity > MAX_ANGULAR_VELOCITY)
          angularVelocity = MAX_ANGULAR_VELOCITY;
        else if (angularVelocity < -MAX_ANGULAR_VELOCITY)
          angularVelocity = -MAX_ANGULAR_VELOCITY;
      };
      window.addEventListener("wheel", onWheel, { passive: false });

      // --- Touch / pointer drag -> same Y rotation (mobile) ------------------
      // Vertical drag on the canvas rotates the monogram (same axis as wheel);
      // release keeps inertia. The canvas only receives pointer events where the
      // corner UI isn't (higher z-index), so links stay tappable.
      let dragging = false;
      let lastPointerY = 0;
      let lastPointerT = 0;
      const onPointerDown = (e: PointerEvent) => {
        if (prefersReducedMotion) return;
        dragging = true;
        lastPointerY = e.clientY;
        lastPointerT = performance.now();
        angularVelocity = 0;
        canvas.setPointerCapture?.(e.pointerId);
      };
      const onPointerMove = (e: PointerEvent) => {
        if (!dragging) return;
        // While a tactile press is active the monogram holds still under the
        // finger — suppress rotation (position is preserved, inertia untouched).
        if (tacActive) {
          lastPointerY = e.clientY;
          lastPointerT = performance.now();
          return;
        }
        const t = performance.now();
        const dy = e.clientY - lastPointerY;
        const dtp = Math.max(0.001, (t - lastPointerT) / 1000);
        lastPointerY = e.clientY;
        lastPointerT = t;
        lastInputTime = t; // drag also feeds the heat timer
        const deltaRot = dy * DRAG_SENSITIVITY;
        scrollRotY += deltaRot; // direct 1:1 manipulation (composed in the loop)
        // Carry the instantaneous drag speed as velocity so release keeps inertia.
        let v = deltaRot / dtp;
        if (v > MAX_ANGULAR_VELOCITY) v = MAX_ANGULAR_VELOCITY;
        else if (v < -MAX_ANGULAR_VELOCITY) v = -MAX_ANGULAR_VELOCITY;
        angularVelocity = v;
      };
      const onPointerUp = (e: PointerEvent) => {
        if (!dragging) return;
        dragging = false;
        canvas.releasePointerCapture?.(e.pointerId);
      };
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("pointercancel", onPointerUp);

      // --- Tactile pressure / liquid touch (mobile only) ---------------------
      // Passive touch listeners on the canvas — NEVER preventDefault, so scroll,
      // taps, links, menu and native gestures stay free. A touch on the monogram
      // (raycast hit) starts a press CANDIDATE; it only becomes an active press
      // in the loop after holdActivationMs while staying still. Any real movement
      // before that = a drag/scroll -> cancel. Multi-touch / cancel -> cancel.
      const tacAllowed = () =>
        vw <= TACTILE.mobileMaxWidth && EFFECTS.ENABLE_MOBILE_TACTILE_PRESSURE;
      const setTouchUV = (cx: number, cy: number) => {
        touchUV.set(cx / window.innerWidth, 1 - cy / window.innerHeight);
      };
      const cancelTactile = () => {
        tacCandidate = false;
        tacActive = false;
        telemetry.tacCandidate = false;
        telemetry.tacActive = false;
      };
      const startRipple = (small: boolean) => {
        rippleUV.copy(touchUV);
        rippleStart = performance.now();
        rippleDurMs = small
          ? TACTILE.tapRippleDurationMs
          : TACTILE.rippleDurationMs;
        rippleScale = small ? TACTILE.tapRippleScale : 1;
        rippleActive = true;
      };
      const fireHaptic = () => {
        if (
          hapticSupported &&
          !prefersReducedMotion &&
          TACTILE.pressureIntensity > 0
        ) {
          try {
            navigator.vibrate?.(TACTILE.hapticMs);
          } catch {
            /* ignore */
          }
        }
      };
      const onTouchStart = (e: TouchEvent) => {
        if (!tacAllowed()) return;
        if (e.touches.length > 1) {
          cancelTactile(); // multi-touch (pinch etc.) -> never interfere
          return;
        }
        const tt = e.touches[0];
        // Raycast: only start if the touch visually hits the monogram mesh.
        ndc.set(
          (tt.clientX / window.innerWidth) * 2 - 1,
          -(tt.clientY / window.innerHeight) * 2 + 1,
        );
        raycaster.setFromCamera(ndc, camera);
        const hit = raycaster.intersectObject(mesh, false).length > 0;
        telemetry.tacHitMonogram = hit;
        telemetry.tacTouchX = tt.clientX / window.innerWidth;
        telemetry.tacTouchY = tt.clientY / window.innerHeight;
        telemetry.tacScrollCancelled = false;
        if (!hit) return; // empty canvas / not the monogram -> leave it alone
        tacCandidate = true;
        tacActive = false;
        tacStartX = tt.clientX;
        tacStartY = tt.clientY;
        tacStartTime = performance.now();
        setTouchUV(tt.clientX, tt.clientY);
      };
      const onTouchMove = (e: TouchEvent) => {
        if (!tacCandidate && !tacActive) return;
        if (e.touches.length > 1) {
          cancelTactile();
          return;
        }
        const tt = e.touches[0];
        const dist = Math.hypot(tt.clientX - tacStartX, tt.clientY - tacStartY);
        telemetry.tacTouchX = tt.clientX / window.innerWidth;
        telemetry.tacTouchY = tt.clientY / window.innerHeight;
        if (!tacActive) {
          // Moved before activation -> it's a drag/scroll: release the gesture.
          if (dist > TACTILE.moveThresholdPx) {
            tacCandidate = false;
            telemetry.tacScrollCancelled = true;
            telemetry.tacCandidate = false;
          }
        } else if (dist > TACTILE.cancelThresholdPx) {
          cancelTactile(); // moved too far during the press -> cancel cleanly
        } else {
          setTouchUV(tt.clientX, tt.clientY); // small drift: follow the finger
        }
      };
      const onTouchEnd = (e: TouchEvent) => {
        if (e.touches.length > 0) return; // other fingers still down
        if (tacActive) {
          startRipple(false); // valid press release -> full ripple + haptic
          fireHaptic();
        } else if (tacCandidate) {
          const held = performance.now() - tacStartTime;
          if (held < TACTILE.tapMaxMs && !prefersReducedMotion) startRipple(true); // tap
        }
        tacCandidate = false;
        tacActive = false;
      };
      canvas.addEventListener("touchstart", onTouchStart, { passive: true });
      canvas.addEventListener("touchmove", onTouchMove, { passive: true });
      canvas.addEventListener("touchend", onTouchEnd, { passive: true });
      canvas.addEventListener("touchcancel", cancelTactile, { passive: true });

      // --- Frequency Field input (desktop pointer + mobile touch) ------------
      // Passive, window-level, read-only: it never calls preventDefault, so
      // scroll, taps, links, menu, player and native gestures are untouched. It
      // only reads the pointer position and bumps the field strength on real
      // movement; the field then eases + decays in the loop.
      const onFieldPointer = (e: PointerEvent) => {
        if (!fieldAllowed || !EFFECTS.ENABLE_FREQUENCY_FIELD) return;
        const nx = e.clientX / window.innerWidth;
        const ny = e.clientY / window.innerHeight;
        // movement magnitude (normalized) drives the strength ramp
        const moved = Math.hypot(nx - fieldLastX, ny - fieldLastY);
        fieldLastX = nx;
        fieldLastY = ny;
        fieldTX = nx;
        fieldTY = ny;
        fieldStrength = Math.min(1, fieldStrength + moved * 6);
      };
      // Attach whenever motion is allowed; the handler + loop gate on the live
      // ENABLE flag so the debug panel can toggle the field on/off at runtime.
      if (fieldAllowed) {
        window.addEventListener("pointermove", onFieldPointer, { passive: true });
      }

      // Sonic Pulse: this loop is the single rAF driver while mounted.
      setAudioDriver(true);

      // --- Resize ------------------------------------------------------------
      const onResize = () => {
        vw = window.innerWidth;
        vh = window.innerHeight;
        camera.left = -vw / 2;
        camera.right = vw / 2;
        camera.top = vh / 2;
        camera.bottom = -vh / 2;
        camera.updateProjectionMatrix();
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxDpr()));
        renderer.setSize(vw, vh, false);
        // (marquee uniforms are set per-frame by setMarqueeUniforms)
        marqueePlane.scale.set(vw, vh, 1);
        if (useCustomGlass && rt && glassShader) {
          const s = GLASS_TIERS[currentTier].rtScale;
          rt.setSize(
            Math.max(2, Math.round(vw * rtDpr() * s)),
            Math.max(2, Math.round(vh * rtDpr() * s)),
          );
          glassShader.uniforms.uResolution.value.set(vw, vh);
        }
        applyFit();
      };
      window.addEventListener("resize", onResize);
      // Orientation changes and Safari's dynamic viewport (URL/tool bars showing
      // or hiding) change the usable height without always firing a window
      // "resize"; listen to those too so the canvas + refraction render target
      // are re-sized to the real viewport. Coalesced to one update per frame so
      // an animating bar can't thrash the render-target reallocation.
      let resizeRaf = 0;
      const onResizeCoalesced = () => {
        if (resizeRaf) return;
        resizeRaf = requestAnimationFrame(() => {
          resizeRaf = 0;
          onResize();
        });
      };
      window.addEventListener("orientationchange", onResizeCoalesced);
      window.visualViewport?.addEventListener("resize", onResizeCoalesced);

      // --- Pause the loop when the tab is hidden; resume when visible --------
      let paused = false;
      const onVisibility = () => {
        if (document.hidden) {
          paused = true;
          cancelTactile(); // don't leave a press/ripple stuck across background
          cancelAnimationFrame(rafId);
        } else if (paused) {
          paused = false;
          lastFrame = performance.now();
          rafId = requestAnimationFrame(loop);
        }
      };
      document.addEventListener("visibilitychange", onVisibility);

      // --- WebGL context lost / restored ------------------------------------
      const onContextLost = (e: Event) => {
        e.preventDefault();
        cancelAnimationFrame(rafId);
      };
      const onContextRestored = () => {
        lastFrame = performance.now();
        if (!document.hidden) rafId = requestAnimationFrame(loop);
      };
      canvas.addEventListener("webglcontextlost", onContextLost);
      canvas.addEventListener("webglcontextrestored", onContextRestored);

      // First paint, reveal, hide fallback. Then run the continuous loop.
      renderFrame();
      setReady(true);
      lastFrame = performance.now();
      rafId = requestAnimationFrame(loop);

      cleanup = () => {
        cancelAnimationFrame(rafId);
        // Reset the background heat so routes without the monogram show base.
        rootStyle.setProperty("--heat-r", "0");
        rootStyle.setProperty("--heat-b", "0");
        if (resizeRaf) cancelAnimationFrame(resizeRaf);
        for (const t of glitchTimers) clearTimeout(t);
        window.removeEventListener("wheel", onWheel);
        window.removeEventListener("resize", onResize);
        window.removeEventListener("orientationchange", onResizeCoalesced);
        window.visualViewport?.removeEventListener("resize", onResizeCoalesced);
        window.removeEventListener("pointermove", onFieldPointer);
        // Hand the single audio rAF back to the engine (player bar keeps working
        // on routes without the WebGL scene).
        setAudioDriver(false);
        document.removeEventListener("visibilitychange", onVisibility);
        canvas.removeEventListener("webglcontextlost", onContextLost);
        canvas.removeEventListener("webglcontextrestored", onContextRestored);
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerup", onPointerUp);
        canvas.removeEventListener("pointercancel", onPointerUp);
        canvas.removeEventListener("touchstart", onTouchStart);
        canvas.removeEventListener("touchmove", onTouchMove);
        canvas.removeEventListener("touchend", onTouchEnd);
        canvas.removeEventListener("touchcancel", cancelTactile);
        marqueeTexPromise.then((tex) => tex?.dispose()).catch(() => {});
        blankTex.dispose();
        hmTex.dispose();
        for (const gm of glitchMats) gm.dispose();
        portalMarker.geometry.dispose();
        (portalMarker.material as import("three").Material).dispose();
        geometry.dispose();
        (mesh.material as import("three").Material).dispose();
        glassShader?.dispose();
        rt?.dispose();
        marqueePlane.geometry.dispose();
        marqueeMaterial.dispose();
        envRT.texture.dispose();
        pmrem.dispose();
        renderer.dispose();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
    // initialOpacity is an init-only seed (route-correct first paint); the loop
    // drives coverage live thereafter — intentionally not a re-run dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={stageRef} className={styles.stage} aria-hidden="true">
      <canvas ref={canvasRef} className={styles.canvas} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/assets/svg/monogram.svg"
        alt=""
        width={490}
        height={848}
        className={`${styles.fallback} ${ready ? styles.fallbackHidden : ""}`}
      />
    </div>
  );
}
