import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Coming Soon teaser + audio-isolation guards. /capsule-coming-soon is a PUBLIC
 * teaser, visually like the hub but with NO navigation, NO cart, a [COMING SOON]
 * cursor/label, a logo back to the music home, and the same music-free audio policy
 * as the real shop. Source-level assertions (no DOM test runner).
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const page = read("src/app/capsule-coming-soon/page.tsx");
const view = read("src/components/capsule/CapsuleLandingView.tsx");
const capsuleLayout = read("src/app/capsule/layout.tsx");
const header = read("src/components/capsule/CapsuleHeader.tsx");
const route = read("src/effects/capsuleRoute.ts");
const audioProvider = read("src/components/AudioProvider.tsx");
const shell = read("src/components/Shell.tsx");

test("the route renders the shared landing view in comingSoon mode", () => {
  assert.match(page, /CapsuleLandingView/);
  assert.match(page, /mode="comingSoon"/);
});

test("PRODUCTION gate: the WIP /capsule* shop is 404 on production (teaser stays public)", () => {
  // The /capsule route-group layout notFound()s on production deploys, so only the
  // public /capsule-coming-soon teaser (a separate route, NOT under this layout)
  // ships live. Preview + local (VERCEL_ENV unset/"preview") keep /capsule reachable.
  assert.match(capsuleLayout, /process\.env\.VERCEL_ENV === "production"/);
  assert.match(capsuleLayout, /notFound\(\)/);
  // the teaser page is outside the /capsule route group, so it is never gated.
  assert.ok(!/VERCEL_ENV/.test(page), "the teaser route carries no production gate");
});

test("teaser images are NON-navigable (rendered as a plain div, not a link/button)", () => {
  // The comingSoon image container is a <div> carrying only the informative cursor
  // zone (the shop branch uses <Link>). Isolate that div and prove it has no
  // navigation semantics — no link, handler, focusability or link/button role.
  const m = view.match(/<div\s+key={side\.image}[\s\S]*?<\/div>/);
  assert.ok(m, "coming-soon image container is a <div>");
  const div = m[0];
  assert.match(div, /data-cursor-label="\[COMING SOON\]"/);
  assert.ok(
    !/<Link|href=|onClick|tabIndex|role=/.test(div),
    "teaser image must not be a link/button or focusable",
  );
});

test("teaser has NO cart and a decorative (inert) burger; logo → the music home", () => {
  // comingSoon variant does not mount the cart button (guarded by !comingSoon).
  assert.match(header, /\{!comingSoon && <CapsuleCartButton \/>\}/);
  // decorative burger is aria-hidden and not a <button>.
  assert.match(header, /styles\.burgerStatic/);
  assert.match(header, /aria-hidden="true"[\s\S]*burgerStatic/);
  assert.match(header, /const logoHref = comingSoon \? "\/" : "\/capsule"/);
});

test("teaser keeps the marquee and shows a [COMING SOON] label (mobile) / cursor (desktop)", () => {
  assert.match(view, /CapsuleMarquee/);
  // the label is now an overlay on the marquee (mobile), passed via overlayLabel
  assert.match(view, /overlayLabel=\{comingSoon \? "\[COMING SOON\]" : undefined\}/);
  assert.match(view, /\[COMING SOON\]/);
});

test("audio isolation: /capsule-coming-soon is in the music-free predicate", () => {
  assert.match(route, /CAPSULE_COMING_SOON_PATH\s*=\s*"\/capsule-coming-soon"/);
  // isCapsuleRoute (the ONE predicate used by both the Shell + the audio lockout)
  // explicitly covers the teaser path.
  const fn = route.slice(route.indexOf("export function isCapsuleRoute"));
  assert.match(fn, /CAPSULE_COMING_SOON_PATH/);
  // Both the chrome exclusion and the audio suppression consume that predicate.
  assert.match(shell, /isCapsuleRoute\(pathname\)/);
  assert.match(audioProvider, /isCapsuleRoute\(pathname\)/);
});
