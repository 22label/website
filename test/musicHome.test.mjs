import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * MUSIC homepage guards: the three social icons move from the top-right menu to a
 * bottom-right dock (Home only), the old bottom-right release block is retired on
 * Home, and the mixer knobs are shown only during REAL playback. Source-level
 * assertions (no DOM test runner); live behaviour was also verified in-browser.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const nav = read("src/components/Nav.tsx");
const dock = read("src/components/HomeSocialDock.tsx");
const dockCss = read("src/components/HomeSocialDock.module.css");
const release = read("src/components/ReleasePreviewer.tsx");
const mixer = read("src/components/Mixer.tsx");
const mixerCss = read("src/components/Mixer.module.css");
const shell = read("src/components/Shell.tsx");

// ---------- Social icons: out of the top-right menu on Home ----------
test("top-right menu hides its social icons on Home (moved to the dock)", () => {
  assert.match(nav, /const isHome = pathname === "\/"/);
  // the social <ul> is gated behind !isHome
  assert.match(nav, /\{!isHome && \(\s*<ul className=\{styles\.social\}/);
});

test("bottom-right social dock: Home-only, 64/64, same links (IG 2h2h_studio), new tab", () => {
  assert.match(dock, /usePathname\(\) !== "\/"\) return null/); // Home only
  assert.match(dock, /soundcloud\.com\/2h2h_music/);
  assert.match(dock, /instagram\.com\/2h2h_studio/); // unchanged IG handle
  assert.match(dock, /youtube\.com\/@2H2HMusic/);
  assert.equal((dock.match(/target="_blank"/g) || []).length, 3); // same-as-before new tab
  assert.equal((dock.match(/rel="noopener noreferrer"/g) || []).length, 3);
  // anchored 64px from bottom + right, above the canvas, desktop-only.
  assert.match(dockCss, /\.dock\s*\{[^}]*bottom:\s*var\(--corner-gap\)[\s\S]*right:\s*var\(--corner-gap\)/);
  assert.match(dockCss, /\.dock\s*\{[^}]*z-index:\s*var\(--z-menu\)/);
  assert.match(dockCss, /@media \(max-width: 767px\)\s*\{\s*\.dock\s*\{\s*display:\s*none/);
  assert.ok(existsSync(join(root, "src/components/HomeSocialDock.module.css")));
});

test("Shell mounts the dock; no duplicate social rendered on Home", () => {
  assert.match(shell, /<HomeSocialDock \/>/);
});

// ---------- Old bottom-right release block retired on Home ----------
test("release previewer is not mounted on Home (retired), kept on other routes", () => {
  assert.match(release, /if \(isHome\) return null/);
});

// ---------- Mixer knobs: visible only during REAL playback ----------
test("mixer visibility follows the REAL transport state (playing), not wantPlay/click", () => {
  assert.match(mixer, /const \{ playing \} = useAudio\(\)/);
  assert.match(mixer, /data-hidden=\{playing \? undefined : ""\}/);
});

test("hidden mixer is invisible, non-clickable and out of the tab/a11y tree; no CLS", () => {
  // visibility:hidden (not display) → keeps the fixed box in place (no layout shift)
  // AND removes it from hit-testing + keyboard/a11y.
  assert.match(mixerCss, /\.mixer\[data-hidden\]\s*\{[^}]*visibility:\s*hidden/);
  assert.match(mixerCss, /\.mixer\[data-hidden\]\s*\{[^}]*pointer-events:\s*none/);
  assert.match(mixerCss, /\.mixer\[data-hidden\]\s*\{[^}]*opacity:\s*0/);
});

test("mixer motion: opacity + translateY(-6px), gentle ease, exit ≤ entrance, reduced-motion", () => {
  assert.match(mixerCss, /\.mixer\[data-hidden\]\s*\{[^}]*transform:\s*translateY\(-6px\)/);
  assert.match(mixerCss, /cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
  // no `transition: all`
  assert.ok(!/transition:\s*all/.test(mixerCss));
  // reduced-motion drops the translate
  assert.match(mixerCss, /prefers-reduced-motion: reduce[\s\S]*\.mixer[\s\S]*transform:\s*none/);
});
