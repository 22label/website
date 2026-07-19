"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./Monogram.module.css";

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
  void main() {
    vec2 p = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y); // y-down
    float ang = radians(152.689);
    vec2 dir = vec2(sin(ang), -cos(ang));
    vec2 center = uResolution * 0.5;
    float halfLen = (abs(uResolution.x * dir.x) + abs(uResolution.y * dir.y)) * 0.5;
    float t = dot(p - center, dir) / (2.0 * halfLen) + 0.5;
    float u = clamp((t - 0.17843) / (0.8303 - 0.17843), 0.0, 1.0);
    vec3 col = mix(vec3(44.0, 52.0, 62.0) / 255.0, uDarkStop, u);
    float bandTop = (uResolution.y - uBandH) * 0.5;
    if (p.y >= bandTop && p.y <= bandTop + uBandH) {
      float tx = fract((p.x + uOffset) / uGroupW);
      float ty = (p.y - bandTop) / uBandH;
      float a = texture2D(uText, vec2(tx, ty)).a;
      col = mix(col, vec3(1.0), a);
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

const MARQUEE_VERTEX = /* glsl */ `
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export default function Monogram() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

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
      // Mobile caps the pixel ratio for the extra refraction cost; desktop keeps 2.
      const maxDpr = () => (window.innerWidth <= 767 ? 1.25 : 2);
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
          rtDpr: 2, // min(pr(),2) === pr() on mobile -> RT unchanged
          tiers: {
            high: { rtScale: 0.8, samples: 9, dispersion: 1 },
            medium: { rtScale: 0.68, samples: 5, dispersion: 1 },
            // Baseline RGB dispersion must survive the adaptive downgrade, so
            // the cheapest tier KEEPS chromatic aberration (2 taps) — it only
            // sheds blur taps. dispersion:0 here was what made the monogram go
            // monochromatic a couple of seconds in on slower phones.
            fallback: { rtScale: 0.55, samples: 3, dispersion: 1 },
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
          vec2 uv = vScreenUV + refractDir * uRefractionStrength;

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
              ? `float ca = uChromaticAberration;
          col.r = mix(col.r, texture2D(tBackground, uv + refractDir * ca).r, 0.7);
          col.b = mix(col.b, texture2D(tBackground, uv - refractDir * ca).b, 0.7);`
              : ``
          }

          col = mix(col, uTint, uTintStrength);

          float fres = pow(1.0 - clamp(N.z, 0.0, 1.0), 3.0) * uFresnelStrength;
          col += fres * vec3(0.45, 0.6, 1.0);

          vec3 L = normalize(uLightDirection);
          vec3 H = normalize(L + V);
          float spec = pow(max(dot(N, H), 0.0), 48.0) * uSpecularStrength;
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
      // #580001 (rgb 88,0,1), driven by the SAME eased heat as the monogram. We
      // update the marquee shader (the real Home background, covered by the
      // WebGL canvas) and the CSS body gradient (used on other routes / the SVG
      // fallback) from one place, so there is no second heat system.
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
      const smoothstep01 = (x: number) => x * x * (3 - 2 * x);
      const applyHeat = () => {
        if (heat === appliedHeat) return;
        appliedHeat = heat;
        const eased = smoothstep01(heat); // smooth colour + opacity
        heatColor.copy(COLD).lerpHSL(HOT, eased);
        // Background dark stop tracks the same eased heat (#000 -> #580001).
        const darkR = HEAT_DARK_R * eased;
        const darkB = HEAT_DARK_B * eased;
        marqueeMaterial.uniforms.uDarkStop.value.set(darkR / 255, 0, darkB / 255);
        rootStyle.setProperty("--heat-r", `${Math.round(darkR)}`);
        rootStyle.setProperty("--heat-b", `${Math.round(darkB)}`);
        // Frost ramps in only over BLUR_START..1, smoothly.
        const frost = smoothstep01(
          Math.min(1, Math.max(0, (heat - BLUR_START) / (1 - BLUR_START))),
        );
        if (useCustomGlass && glassShader) {
          glassShader.uniforms.uTint.value.copy(heatColor);
          // 11% look -> ~22% look: double the tint's visual weight at full heat.
          glassShader.uniforms.uTintStrength.value = baseTint * (1 + eased);
          // Blur ONLY the monogram's own optical content (its refraction taps).
          glassShader.uniforms.uBlurStrength.value = baseBlur + frost * BLUR_MAX_ADD;
          // Dynamic RGB boost rides on top of the always-on baseline; when heat
          // decays the boost unwinds to baseChroma, so the separation persists.
          glassShader.uniforms.uChromaticAberration.value =
            baseChroma + eased * CHROMA_BOOST;
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

      const applyFit = () => {
        if (vw <= 767) {
          // Mobile: ~467px tall near the top (Figma), so the marquee reads on
          // the sides. Proportional to height; centred horizontally.
          const targetH = Math.min(vh * 0.575, vh - 240);
          mesh.scale.setScalar(targetH / naturalHeight);
          mesh.position.y = vh / 2 - (vh * 0.15 + targetH / 2); // top ~122@812
        } else {
          mesh.scale.setScalar((vh - MARGIN * 2) / naturalHeight);
          mesh.position.y = 0;
        }
      };
      applyFit();

      // --- Loop (continuous: the marquee scrolls every frame) ----------------
      let angularVelocity = 0; // rad/s
      let lastInputTime = -Infinity; // performance.now() of the last scroll/drag
      let rafId = 0;
      let lastFrame = performance.now();
      let marqueeOffsetFrac = 0; // 0..1, resolution-independent scroll phase

      // Set the marquee uniforms for a given target resolution + scale so PASS 1
      // (render target) and PASS 2 (screen) produce an IDENTICAL normalised
      // marquee — the refracted copy stays aligned with the direct one.
      // Resolution-normalised: the marquee layout is the same fraction of the
      // buffer at ANY size/dpr, so PASS 1 (RT, capped dpr) and PASS 2 (screen,
      // dpr 2) stay perfectly aligned. Identical output to before on mobile.
      const setMarqueeUniforms = (resW: number, resH: number) => {
        const u = marqueeMaterial.uniforms;
        u.uResolution.value.set(resW, resH);
        u.uGroupW.value = ((groupWorldW * marqueeScale()) / vw) * resW;
        u.uBandH.value = ((MARQUEE_BAND_H * marqueeScale()) / vh) * resH;
        u.uOffset.value = marqueeOffsetFrac * (u.uGroupW.value as number);
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
        const dt = Math.min(64, now - lastFrame);
        lastFrame = now;
        const dtSec = dt / 1000;

        // marquee scroll phase (right -> left), resolution-independent + seamless
        marqueeOffsetFrac = (marqueeOffsetFrac + dt / MARQUEE_CYCLE_MS) % 1;

        // --- Rotation inertia (frame-rate independent) -----------------------
        mesh.rotation.y += angularVelocity * dtSec;
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

        renderFrame();

        // one-time tier downgrade from measured average frame time
        if (!tierLocked) {
          perfAccum += dt;
          perfFrames++;
          if (perfFrames >= 80) {
            const avg = perfAccum / perfFrames;
            tierLocked = true;
            if (avg > 26) applyGlassTier("fallback");
            else if (avg > 20 && currentTier === "high") applyGlassTier("medium");
          }
        }

        rafId = requestAnimationFrame(loop);
      };

      // --- Glitch scheduler --------------------------------------------------
      const glitchTimers: ReturnType<typeof setTimeout>[] = [];
      const triggerGlitch = () => {
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
        const nd = normalizeWheel(e);
        if (prefersReducedMotion) {
          // No prolonged inertia under reduced motion: a small direct nudge.
          mesh.rotation.y += nd * REDUCED_MOTION_ROTATE;
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
        const t = performance.now();
        const dy = e.clientY - lastPointerY;
        const dtp = Math.max(0.001, (t - lastPointerT) / 1000);
        lastPointerY = e.clientY;
        lastPointerT = t;
        lastInputTime = t; // drag also feeds the heat timer
        const deltaRot = dy * DRAG_SENSITIVITY;
        mesh.rotation.y += deltaRot; // direct 1:1 manipulation
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

      // --- Pause the loop when the tab is hidden; resume when visible --------
      let paused = false;
      const onVisibility = () => {
        if (document.hidden) {
          paused = true;
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
        for (const t of glitchTimers) clearTimeout(t);
        window.removeEventListener("wheel", onWheel);
        window.removeEventListener("resize", onResize);
        document.removeEventListener("visibilitychange", onVisibility);
        canvas.removeEventListener("webglcontextlost", onContextLost);
        canvas.removeEventListener("webglcontextrestored", onContextRestored);
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerup", onPointerUp);
        canvas.removeEventListener("pointercancel", onPointerUp);
        marqueeTexPromise.then((tex) => tex?.dispose()).catch(() => {});
        blankTex.dispose();
        for (const gm of glitchMats) gm.dispose();
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
