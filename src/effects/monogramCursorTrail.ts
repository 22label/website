/**
 * MONOGRAM CURSOR TRAIL — a soft, diffused #73F608 glow that renders ONLY on the
 * live monogram silhouette.
 *
 * The trail lives inside the Monogram WebGL context so it can be clipped by the
 * REAL monogram geometry every frame (rotation-aware, cavities excluded) — not a
 * rectangular approved zone. It is drawn as ONE final additive pass appended after
 * the scene render, using the STENCIL buffer as the mask:
 *   1. the real monogram geometry is stamped into the stencil buffer (colour
 *      writes off), so stencil = 1 exactly over the visible silhouette (its holes
 *      leave stencil = 0 → the trail can never appear in the cavities);
 *   2. the trail points are drawn with a stencil test EQUAL 1, so fragments only
 *      survive over actual monogram pixels.
 * The glass shader / refraction / transmission passes are NOT touched — this is a
 * standalone overlay pass that reuses the existing renderer, camera and mesh.
 *
 * Samples are pushed by the caller only when its raycaster hits the monogram, so
 * new samples begin on the surface and stop on leave; the per-frame stencil clip
 * then keeps even fading samples inside the current silhouette as it rotates.
 *
 * GPU-oriented: one instanced ring buffer of billboard quads (no per-frame array
 * creation, no DOM nodes), reused typed arrays/attributes, procedural radial glow
 * (soft halo, no hard edge). Quads (not GL points) so the halo is never clamped by
 * the driver's point-size ceiling — identical CSS footprint across browsers/DPR.
 * THREE is passed in (never statically imported).
 * Lifecycle: sample / update / render / resize / dispose.
 */
import type * as THREE from "three";
import { TRAIL } from "@/effects/effectsConfig";

export type MonogramCursorTrail = {
  /** Push a trail sample at a viewport pixel (caller gates on a monogram raycast hit). */
  sample: (clientX: number, clientY: number) => void;
  /** Advance sample ages and sync the silhouette to the monogram's world matrix. */
  update: (dtSec: number) => void;
  /** Stencil-masked additive pass on the default framebuffer (after the scene render). */
  render: () => void;
  resize: (vw: number, vh: number, dpr: number) => void;
  dispose: () => void;
};

// Each sample is a screen-aligned BILLBOARD QUAD (instanced), NOT a GL point.
// gl_PointSize is capped by the driver's ALIASED_POINT_SIZE_RANGE — that ceiling
// is far smaller on Firefox/macOS than on Chrome (ANGLE) / Safari (Metal), so a
// 110px halo × DPR clamped to it, making the trail look smaller in Firefox only. A
// quad has no such cap and is inherently DPR-correct: the orthographic camera maps
// world units 1:1 to CSS px (positions are `clientX - vw/2`), so a quad sized in
// world units renders the same CSS footprint at every DPR and in every browser.
const TRAIL_VERT = /* glsl */ `
  attribute vec3 aOffset;                // instance centre (world px, z = 0)
  attribute float aLife;                 // 1 = fresh, 0 = dead
  uniform float uHalo;                    // sprite footprint (CSS px == world units)
  varying vec2 vUv;                       // -1..1 across the sprite (replaces gl_PointCoord)
  varying float vLife;
  void main() {
    vLife = aLife;
    vUv = position.xy * 2.0;              // base corner -0.5..0.5 -> -1..1
    float sz = aLife > 0.0 ? uHalo : 0.0; // dead samples collapse to nothing
    // Axis-aligned ortho camera (no roll) → offsetting in world XY is already
    // screen-aligned; no per-vertex billboard basis needed.
    vec3 world = aOffset + vec3(position.xy * sz, 0.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
  }
`;

const TRAIL_FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;       // #73F608
  uniform float uCoreFrac, uPeak;
  varying vec2 vUv;
  varying float vLife;
  void main() {
    float d = length(vUv);                         // 0 centre .. 1 sprite edge
    if (d > 1.0) discard;                          // round, no hard square edge
    float halo = exp(-d * d * 3.2);                // soft diffused gaussian falloff
    float core = smoothstep(uCoreFrac, 0.0, d);    // brighter ~22px core
    float a = vLife * uPeak * clamp(halo + core * 0.6, 0.0, 1.0);
    gl_FragColor = vec4(uColor, a);
  }
`;

export function createMonogramCursorTrail(
  three: typeof import("three"),
  opts: {
    renderer: THREE.WebGLRenderer;
    camera: THREE.Camera;
    monogram: THREE.Mesh; // real monogram (geometry + live world matrix)
    vw: number;
    vh: number;
    dpr: number;
  },
): MonogramCursorTrail {
  const { renderer, camera, monogram } = opts;
  const MAX = TRAIL.maxPoints;

  let vw = opts.vw;
  let vh = opts.vh;

  // --- Silhouette mask: the REAL monogram geometry stamped into the stencil -----
  // Shares the monogram's BufferGeometry (no duplicated geometry data). DoubleSide
  // + no depth test → the union of all faces fills the exact screen silhouette;
  // the geometry's holes stay unstamped so cavities are excluded.
  const silMat = new three.MeshBasicMaterial({
    colorWrite: false,
    depthTest: false,
    depthWrite: false,
    side: three.DoubleSide,
    stencilWrite: true,
    stencilFunc: three.AlwaysStencilFunc,
    stencilRef: 1,
    stencilFail: three.ReplaceStencilOp,
    stencilZFail: three.ReplaceStencilOp,
    stencilZPass: three.ReplaceStencilOp,
  });
  const silMesh = new three.Mesh(monogram.geometry, silMat);
  silMesh.matrixAutoUpdate = false; // driven from the monogram's world matrix
  silMesh.frustumCulled = false;
  const silScene = new three.Scene();
  silScene.add(silMesh);

  // --- Trail ring buffer (instanced billboard quads) ----------------------------
  // One instanced quad per ring slot. Per-instance centre (aOffset) + life (aLife)
  // are the reused dynamic arrays; the base geometry is a single unit quad. Drawn
  // instanced so there is still no per-frame array/DOM churn.
  const positions = new Float32Array(MAX * 3); // instance centres (world px)
  const life = new Float32Array(MAX); // remaining life 0..1 (0 = dead)
  const geometry = new three.InstancedBufferGeometry();
  geometry.instanceCount = MAX;
  // Base unit quad (two triangles), corners -0.5..0.5 → the shader scales it by the
  // halo footprint and offsets it to each instance centre.
  const quad = new Float32Array([
    -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0,
  ]);
  geometry.setAttribute("position", new three.BufferAttribute(quad, 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const offAttr = new three.InstancedBufferAttribute(positions, 3);
  const lifeAttr = new three.InstancedBufferAttribute(life, 1);
  offAttr.setUsage(three.DynamicDrawUsage);
  lifeAttr.setUsage(three.DynamicDrawUsage);
  geometry.setAttribute("aOffset", offAttr);
  geometry.setAttribute("aLife", lifeAttr);

  const trailMat = new three.ShaderMaterial({
    uniforms: {
      uHalo: { value: TRAIL.haloSizePx },
      uColor: {
        value: new three.Color(TRAIL.color[0], TRAIL.color[1], TRAIL.color[2]),
      },
      uCoreFrac: { value: TRAIL.coreFrac },
      uPeak: { value: TRAIL.peakOpacity },
    },
    vertexShader: TRAIL_VERT,
    fragmentShader: TRAIL_FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: three.AdditiveBlending,
    // Test-only against the silhouette stencil (keep, never modify it).
    stencilWrite: true,
    stencilFunc: three.EqualStencilFunc,
    stencilRef: 1,
    stencilFail: three.KeepStencilOp,
    stencilZFail: three.KeepStencilOp,
    stencilZPass: three.KeepStencilOp,
  });
  const trailMesh = new three.Mesh(geometry, trailMat);
  trailMesh.frustumCulled = false;
  const trailScene = new three.Scene();
  trailScene.add(trailMesh);

  let head = 0; // next ring slot to write
  let lastX = 0;
  let lastY = 0;
  let hasLast = false;

  const sample = (clientX: number, clientY: number) => {
    if (hasLast) {
      const dx = clientX - lastX;
      const dy = clientY - lastY;
      if (dx * dx + dy * dy < TRAIL.minMovePx * TRAIL.minMovePx) return;
    }
    lastX = clientX;
    lastY = clientY;
    hasLast = true;
    // Viewport px → orthographic world coords (camera spans ±vw/2, ±vh/2). z=0:
    // the ortho projection makes screen x/y independent of z, and the stencil does
    // the clipping, so depth is irrelevant.
    const i = head * 3;
    positions[i] = clientX - vw / 2;
    positions[i + 1] = vh / 2 - clientY;
    positions[i + 2] = 0;
    life[head] = 1;
    head = (head + 1) % MAX;
    offAttr.needsUpdate = true;
    lifeAttr.needsUpdate = true;
  };

  const update = (dtSec: number) => {
    const dLife = (dtSec * 1000) / TRAIL.lifeMs;
    if (dLife > 0) {
      for (let n = 0; n < MAX; n++) {
        if (life[n] > 0) {
          const v = life[n] - dLife;
          life[n] = v > 0 ? v : 0;
        }
      }
      lifeAttr.needsUpdate = true;
    }
    // Match the silhouette to the monogram's CURRENT world transform (rotation/
    // tilt/scale) so hit region and clip follow it automatically.
    silMesh.matrix.copy(monogram.matrixWorld);
    silMesh.matrixWorldNeedsUpdate = true;
  };

  const render = () => {
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearStencil(); // clear value 0
    renderer.clear(false, false, true); // clear ONLY the stencil (keep the frame)
    renderer.render(silScene, camera); // stamp stencil = 1 over the silhouette
    renderer.render(trailScene, camera); // draw the glow where stencil == 1
    renderer.autoClear = prevAutoClear;
  };

  const resize = (nextVw: number, nextVh: number, dpr: number) => {
    vw = nextVw;
    vh = nextVh;
    opts.dpr = dpr; // tracked for signature parity; quad size is DPR-independent
  };

  const dispose = () => {
    geometry.dispose();
    trailMat.dispose();
    silMat.dispose(); // NOTE: never dispose monogram.geometry — it is shared
  };

  return { sample, update, render, resize, dispose };
}
