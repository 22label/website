import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Source-level guards for the CAPSULE UI requirements that are not pure data (the
 * project ships no DOM test runner). They lock the updated Figma behaviour into CI:
 * accordions closed by default, the price living in the title row (not the CTA), the
 * category-based breadcrumb, the mobile burger's semantics, and the exact desktop /
 * mobile spacing offsets. The live pixel offsets were also verified in-browser.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const productView = read("src/components/capsule/ProductView.tsx");
const productCard = read("src/components/capsule/ProductCard.tsx");
const carousel = read("src/components/capsule/ProductCarousel.tsx");
const landingView = read("src/components/capsule/CapsuleLandingView.tsx");
const marquee = read("src/components/capsule/CapsuleMarquee.tsx");
const accordion = read("src/components/capsule/Accordion.tsx");
const mobileMenu = read("src/components/capsule/CapsuleMobileMenu.tsx");
const css = read("src/components/capsule/capsule.module.css");

// ---------- CTA renamed to ADD TO CART everywhere (no obsolete purchase copy) ----------
test("purchase CTA is 'ADD TO CART' on the SPP and the full ProductCard", () => {
  assert.match(productView, />\s*ADD TO CART\s*</);
  assert.match(productCard, />\s*ADD TO CART\s*</);
});

test("no obsolete purchase CTA copy (PRE ORDER / PRE-ORDER / + ADD) remains as an add action", () => {
  for (const [name, src] of [["ProductView", productView], ["ProductCard", productCard]]) {
    assert.ok(!/PRE[\s-]?ORDER/.test(src), `${name} must not show PRE ORDER`);
    assert.ok(!/\+\s*ADD/.test(src), `${name} must not show + ADD`);
  }
});

// ---------- Purchase area is a fixed region; 52px size→CTA gap, accordion-independent ----------
test("info container is split into a bounded accordion region + a fixed purchase region", () => {
  // accordions live in their own region; sizing + CTA live in the purchase region.
  assert.match(productView, /styles\.accordionRegion/);
  assert.match(productView, /styles\.purchaseRegion[\s\S]*styles\.sizing[\s\S]*ADD TO CART/);
});

test("52px size→CTA gap is a single structural rule; the purchase region is pinned", () => {
  assert.match(css, /\.purchaseRegion\s*\{[^}]*gap:\s*52px/);
  assert.match(css, /\.purchaseRegion\s*\{[^}]*flex:\s*0 0 auto/);
  // accordion region takes the slack (flex:1) + bounds its content (min-height:0 +
  // overflow), so opening/closing a panel never moves the purchase region.
  assert.match(css, /\.accordionRegion\s*\{[^}]*flex:\s*1 1 auto/);
  assert.match(css, /\.accordionRegion\s*\{[^}]*overflow-y:\s*auto/);
  // productInfo no longer distributes with space-between (which would compress on open).
  assert.ok(!/\.productInfo\s*\{[^}]*justify-content:\s*space-between/.test(css));
});

// ---------- Single-product gallery is STATIC (no hover swap, no VIEW cursor) ----------
test("SPP gallery has NO hover swap: no hover tile, no hover computation, no VIEW cursor", () => {
  assert.ok(!/carouselHoverTile|carouselHoverImg/.test(carousel), "no hover tile in the carousel");
  assert.ok(!/carouselHoverTile|carouselHoverImg/.test(css), "no hover-tile CSS remains");
  // ProductView builds a plain gallery — no `hover` field, no gender-gated swap.
  assert.ok(!/\.hover\b/.test(productView) && !/hover:/.test(productView), "no hover computed in ProductView");
  // The SPP never mounts the collection VIEW cursor (that is hub-only, HubCursor).
  assert.ok(!/HubCursor|data-hub-cursor-zone|data-cursor-label/.test(productView), "no VIEW cursor on the SPP");
});

// ---------- Collection hub hover (ProductCard) is the ONLY image-swap context ----------
test("collection hub keeps front→back hover (ProductCard), gated to mouse pointers", () => {
  // ProductCard reveals color.back on hover, gated to mouse so touch can't stick.
  assert.match(productCard, /selected\.back/);
  assert.match(productCard, /pointerType === "mouse"/);
  assert.match(productCard, /onPointerCancel/);
});

// ---------- Responsive landing images (<picture>, distinct crops, no CLS) ----------
test("landing images use <picture> with a mobile <source> + explicit dimensions", () => {
  assert.match(landingView, /<picture>/);
  assert.match(landingView, /<source\s+media="\(max-width: 860px\)"\s+srcSet=\{mobileSrc\}/);
  assert.match(landingView, /src=\{desktopSrc\}/);
  assert.match(landingView, /width=\{854\}[\s\S]*height=\{788\}/); // desktop dims → no CLS
  assert.ok(!/figma\.com\/api\/mcp\/asset/.test(landingView), "no temporary MCP asset URLs");
});

// ---------- Coming Soon: [COMING SOON] label OVERLAID on the marquee (mobile) ----------
test("the [COMING SOON] label is a STATIC overlay on the marquee, outside the animated track", () => {
  // Passed as overlayLabel to CapsuleMarquee (only on the teaser), rendered as a
  // sibling of the track — not inside it, not duplicated in the loop.
  assert.match(landingView, /overlayLabel=\{comingSoon \? "\[COMING SOON\]" : undefined\}/);
  assert.ok(!/comingSoonLabel/.test(landingView), "the old separate label is gone");
  // Rendered AFTER the track, still inside .marquee; aria-hidden; single instance.
  const trackIdx = marquee.indexOf("marqueeTrack");
  const overlayIdx = marquee.indexOf("marqueeOverlay");
  assert.ok(overlayIdx > trackIdx, "overlay is a sibling rendered after the track");
  assert.match(marquee, /overlayLabel &&[\s\S]*marqueeOverlay[\s\S]*aria-hidden="true"/);
  assert.equal((marquee.match(/\{overlayLabel\}/g) || []).length, 1, "label is not duplicated");
});

test("marquee overlay is centred, above the track, non-interactive; mobile-only; exact type", () => {
  // Centred on the marquee bar (absolute inset:0 + flex centre), above the track,
  // pointer-events:none; NOT position:fixed (centred relative to .marquee).
  assert.match(css, /\.marqueeOverlay\s*\{[^}]*position:\s*absolute[\s\S]*?inset:\s*0/);
  assert.match(css, /\.marqueeOverlay\s*\{[^}]*align-items:\s*center[\s\S]*?justify-content:\s*center/);
  assert.match(css, /\.marqueeOverlay\s*\{[^}]*pointer-events:\s*none/);
  assert.ok(!/\.marqueeOverlay\s*\{[^}]*position:\s*fixed/.test(css));
  // exact type (Figma 289-1054): 24px / 2.64px / #000; hidden on desktop, shown mobile.
  assert.match(css, /\.marqueeOverlay\s*\{[^}]*font-size:\s*24px[\s\S]*?letter-spacing:\s*2\.64px/);
  assert.match(css, /\.marqueeOverlay\s*\{[^}]*display:\s*none/); // desktop default
  assert.match(css, /max-width: 860px[\s\S]*\.marqueeOverlay\s*\{\s*display:\s*flex/); // mobile shows it
});

// ---------- Coming Soon uses SEPARATE assets from the shop landing ----------
test("teaser images come from CAPSULE_COMING_SOON (never the shop CAPSULE_LANDING assets)", () => {
  assert.match(landingView, /CAPSULE_COMING_SOON/);
  // the teaser branch resolves its src from CAPSULE_COMING_SOON[audience]
  assert.match(landingView, /comingSoon \? CAPSULE_COMING_SOON\[audience\] : side\.image/);
});

// ---------- Accordions: both closed by default, reset on product change ----------
test("Accordion defaults to CLOSED and drives aria-expanded + symbol from state", () => {
  assert.match(accordion, /defaultOpen\s*=\s*false/); // default prop is closed
  assert.match(accordion, /useState\(defaultOpen\)/);
  assert.match(accordion, /aria-expanded=\{open\}/);
  assert.match(accordion, /aria-controls=\{panelId\}/);
  // "+" when closed (a distinct glyph shown when open).
  assert.match(accordion, /open \? "[^"]+" : "\+"/);
});

test("ProductView renders BOTH accordions closed (no defaultOpen) and remounts per product", () => {
  assert.ok(!/defaultOpen/.test(productView), "no accordion may be forced open");
  // slug-based keys → navigating to another product resets both to closed.
  assert.match(productView, /key=\{`\$\{product\.slug\}-description`\}/);
  assert.match(productView, /key=\{`\$\{product\.slug\}-composition`\}/);
});

// ---------- Price: in the title row, once, never in the CTA ----------
test("price sits in the title row and is removed from the CTA (once in the info block)", () => {
  assert.match(productView, /productTitleRow/);
  assert.match(productView, /productTitlePrice[\s\S]*formatPrice\(product\.price\)/);
  assert.ok(!/ctaPrice/.test(productView), "the CTA must not render a price");
  // exactly one formatPrice(product.price) in the whole product view.
  const occurrences = productView.match(/formatPrice\(product\.price\)/g) || [];
  assert.equal(occurrences.length, 1);
});

test("title row is space-between (title left / price right) and the price never shifts it", () => {
  assert.match(css, /\.productTitleRow\s*\{[^}]*justify-content:\s*space-between/);
  // price is nowrap + non-shrinking, right-anchored; title shrinks first.
  assert.match(css, /\.productTitlePrice\s*\{[^}]*white-space:\s*nowrap/);
  assert.match(css, /\.productHeading\s*\{[^}]*min-width:\s*0/);
  // no display:none hiding the title-row price on any breakpoint anymore.
  assert.ok(!/\.productTitlePrice\s*\{[^}]*display:\s*none/.test(css));
});

// ---------- Breadcrumb: category-based, both breakpoints ----------
test("breadcrumb is category-based: nav[Breadcrumb], category link, aria-current title", () => {
  assert.match(productView, /productBreadcrumb/);
  assert.match(productView, /aria-label="Breadcrumb"/);
  assert.match(productView, /href=\{crumb\.href\}/);
  assert.match(productView, /crumb\.categoryLabel/);
  assert.match(productView, /aria-current="page"[\s\S]*crumb\.title|crumb\.title[\s\S]*aria-current="page"/);
  // reuses the single existing chevron glyph (ChevronLeft), not a second one.
  assert.equal((productView.match(/function ChevronLeft/g) || []).length, 1);
});

// ---------- Mobile burger + menu semantics ----------
test("mobile burger is a real button with dynamic name, aria-expanded, aria-controls", () => {
  assert.match(mobileMenu, /<button/);
  assert.match(mobileMenu, /aria-label=\{open \? "Close menu" : "Open menu"\}/);
  assert.match(mobileMenu, /aria-expanded=\{open\}/);
  assert.match(mobileMenu, /aria-controls=\{MENU_ID\}/);
  assert.match(mobileMenu, /MENU_ID\s*=\s*"capsule-mobile-menu"/);
  // exact two-line Figma glyph (not 3, not an invented raster).
  assert.equal((mobileMenu.match(/<line /g) || []).length, 2);
  // the panel is a modal dialog exposing the real CART action (no invented nav).
  assert.match(mobileMenu, /role="dialog"/);
  assert.match(mobileMenu, /aria-modal="true"/);
});

// ---------- Desktop offsets: CART 64/64, images 64px below the top-left block ----------
test("desktop CART is absolutely pinned top-right at 64px / 64px (out of the grid)", () => {
  assert.match(css, /\.cart\s*\{[^}]*position:\s*absolute[\s\S]*?top:\s*64px[\s\S]*?right:\s*64px/);
});

test("landing keeps a 64px gap between the top-left block and the images (desktop)", () => {
  assert.match(css, /\.landingMain\s*\{[^}]*margin-top:\s*64px/);
});

// ---------- Mobile offsets: header + breadcrumb 16px vertical, safe-area added once ----------
test("shop / collection mobile header keeps 16px top/bottom padding + additive safe-area", () => {
  assert.match(css, /padding:\s*calc\(16px \+ env\(safe-area-inset-top\)\)\s*24px\s*16px/);
});

test("Coming Soon mobile header is 24px on ALL sides (variant-scoped; safe-area separate)", () => {
  // Figma 289-1037: p-24. Scoped to the teaser only via [data-variant="coming-soon"]
  // (the shop header stays 16px); the safe-area inset is added on top of the 24px, so
  // the visual Figma padding stays 24px (computed 24px on non-notch viewports).
  assert.match(
    css,
    /\.topBar\[data-variant="coming-soon"\]\s*\{[^}]*padding:\s*calc\(24px \+ env\(safe-area-inset-top\)\)\s*24px\s*24px/,
  );
  // the header element carries the variant marker on the teaser.
  const header = read("src/components/capsule/CapsuleHeader.tsx");
  assert.match(header, /data-variant=\{comingSoon \? "coming-soon" : undefined\}/);
});

test("mobile breadcrumb container has 16px top + 16px bottom padding", () => {
  assert.match(css, /\.crumbStandalone\s*\{[^}]*padding:\s*16px 24px/);
});
