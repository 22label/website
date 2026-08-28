import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Shared mobile MENU guards. ONE component + ONE link list, themed dark (Music) /
 * light (Capsule Coming Soon, Figma 291-776). Source-level assertions (no DOM test
 * runner); the open/close, a11y, scroll-lock and both themes were verified in-browser.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const menu = read("src/components/MobileMenu.tsx");
const menuCss = read("src/components/MobileMenu.module.css");
const mobileNav = read("src/components/MobileNav.tsx");
const capsuleHeader = read("src/components/capsule/CapsuleHeader.tsx");

// ---------- Single component + single link list, reused by both contexts ----------
test("MobileNav (dark) and Coming Soon (light) reuse the SAME component + link list", () => {
  assert.match(mobileNav, /<MobileMenu theme="dark" \/>/);
  assert.match(capsuleHeader, /<MobileMenu theme="light" \/>/);
  // the link list lives once, in MobileMenu — not duplicated in either caller.
  assert.match(menu, /const MENU_ITEMS =/);
  assert.ok(!/MENU_ITEMS\s*=/.test(mobileNav), "MobileNav must not hard-code a second list");
  assert.ok(!/RELEASES[\s\S]*A DAY WITH[\s\S]*ABOUT/.test(capsuleHeader), "no menu list in the capsule header");
});

test("menu items = current Music menu, in order, with CAPSULE → the teaser", () => {
  // RELEASES, CAPSULE (shared link), A DAY WITH, ABOUT — HOME is the logo (not listed).
  assert.match(menu, /\{ label: "RELEASES", href: "\/releases" \}[\s\S]*CAPSULE_MUSIC_LINK[\s\S]*\{ label: "A DAY WITH"[\s\S]*\{ label: "ABOUT"/);
  assert.ok(!/label: "HOME"/.test(menu));
  // CAPSULE resolves to /capsule-coming-soon (via CAPSULE_MUSIC_LINK) — never the shop.
  assert.ok(!/\/capsule\//.test(menu) && !/["']\/capsule["']/.test(menu));
});

test("current page is marked with aria-current='page' (CAPSULE on the teaser)", () => {
  assert.match(menu, /const active = item\.href === pathname/);
  assert.match(menu, /aria-current=\{active \? "page" : undefined\}/);
});

// ---------- Burger + modal a11y ----------
test("burger is a real button: dynamic name, aria-expanded, aria-controls", () => {
  assert.match(menu, /<button/);
  assert.match(menu, /aria-label=\{open \? "Close menu" : "Open menu"\}/);
  assert.match(menu, /aria-expanded=\{open\}/);
  assert.match(menu, /aria-controls=\{MENU_ID\}/);
  assert.match(menu, /MENU_ID\s*=\s*"mobile-menu"/);
});

test("SINGLE persistent header: overlay is content-only (no 2nd logo/close bar), no portal", () => {
  // The burger IS the close control (toggles burger↔X in place) — there is NO second
  // logo or close button inside the overlay, and the overlay is NOT portaled elsewhere
  // (it opens BEHIND the one persistent header). This is what eliminates the jump.
  assert.ok(!/createPortal/.test(menu), "no portal — overlay stays in the header's context");
  assert.ok(!/styles\.bar|styles\.closeBtn|styles\.logo\b/.test(menu), "no second logo/close bar");
  assert.equal((menu.match(/styles\.iconBtn/g) || []).length, 1, "exactly one burger/X control");
});

test("modal dialog: Escape, focus trap, scroll lock, focus restore to the burger", () => {
  assert.match(menu, /role="dialog"/);
  assert.match(menu, /aria-modal="true"/);
  assert.match(menu, /e\.key === "Escape"/); // Escape closes
  assert.match(menu, /document\.body\.style\.overflow = "hidden"/); // scroll lock on
  assert.match(menu, /document\.body\.style\.overflow = prevOverflow/); // restored on close
  assert.match(menu, /burger\?\.focus\(\)/); // focus restored to the burger
});

test("navigating a menu item closes the menu (same tab); route change also closes", () => {
  assert.match(menu, /setNavIntent\("internal"\);\s*close\(\);/);
  assert.match(menu, /prevPath\.current !== pathname[\s\S]*setOpen\(false\)/);
  // internal nav links are next/link (same tab) — socials are the only new-tab links.
  assert.equal((menu.match(/target="_blank"/g) || []).length, 3);
});

// ---------- Themes: dark unchanged, light per the frame ----------
test("theme tokens: dark (rgba(42,50,58,.9)/white) vs light (rgba(241,241,241,.9)/black)", () => {
  assert.match(menuCss, /\[data-theme="dark"\][\s\S]*--menu-fg:\s*var\(--white\)[\s\S]*--menu-overlay-bg:\s*rgba\(42, 50, 58, 0\.9\)/);
  assert.match(menuCss, /\[data-theme="light"\][\s\S]*--menu-fg:\s*#000[\s\S]*--menu-overlay-bg:\s*rgba\(241, 241, 241, 0\.9\)/);
  // background + text use the tokens (so one rule set renders both schemes).
  assert.match(menuCss, /\.overlay\s*\{[^}]*background:\s*var\(--menu-overlay-bg\)/);
  assert.match(menuCss, /\.menuNav a\s*\{[^}]*color:\s*var\(--menu-fg\)/);
});

test("overlay opens BEHIND the header (low z), burger sits ABOVE it; reduced motion", () => {
  // Overlay z-index 1 < burger z-index 2, both inside the header's stacking context,
  // so the logo + burger stay on top and never move while the overlay covers the page.
  assert.match(menuCss, /\.overlay\s*\{[^}]*z-index:\s*1\b/);
  assert.match(menuCss, /\.iconBtn\s*\{[^}]*z-index:\s*2\b/);
  assert.match(menuCss, /backdrop-filter:\s*blur\(5\.5px\)/);
  assert.match(menuCss, /prefers-reduced-motion: reduce[\s\S]*animation:\s*none/);
  assert.ok(!/transition:\s*all/.test(menuCss));
});

test("persistent logo is lifted above the overlay in BOTH headers (no jump on open)", () => {
  const navCss = read("src/components/MobileNav.module.css");
  const capCss = read("src/components/capsule/capsule.module.css");
  assert.match(navCss, /\.logoLink\s*\{[^}]*z-index:\s*2/);
  assert.match(capCss, /\.logoLink\s*\{[^}]*z-index:\s*2/);
  // Coming Soon header is a stacking context above the landing so the overlay can sit
  // behind the logo/burger yet above the images/marquee.
  assert.match(capCss, /\.topBar\[data-variant="coming-soon"\]\s*\{[^}]*z-index:\s*40/);
});

test("socials are NOT duplicated — exactly three, once", () => {
  assert.equal((menu.match(/aria-label="2H2H on /g) || []).length, 3);
  assert.equal((menu.match(/ul className=\{styles\.social\}/g) || []).length, 1);
});
