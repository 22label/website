import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Music ⇄ Capsule wiring guards. CAPSULE is now IN the music menu, but it points to
 * the PUBLIC teaser (/capsule-coming-soon) — same tab — and NEVER to the WIP shop hub
 * (/capsule) or its collection/product routes. Source-level assertions (no DOM test
 * runner) that lock the contract.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const nav = read("src/components/Nav.tsx");
const mobileNav = read("src/components/MobileNav.tsx");
const capsuleRoute = read("src/effects/capsuleRoute.ts");
const capsuleHeader = read("src/components/capsule/CapsuleHeader.tsx");

test("CAPSULE_MUSIC_LINK targets the teaser in the SAME tab (no new-tab attrs)", () => {
  assert.match(capsuleRoute, /CAPSULE_MUSIC_LINK\s*=/);
  assert.match(capsuleRoute, /label:\s*"CAPSULE"/);
  assert.match(capsuleRoute, /href:\s*CAPSULE_COMING_SOON_PATH/);
  assert.match(capsuleRoute, /CAPSULE_COMING_SOON_PATH\s*=\s*"\/capsule-coming-soon"/);
  // Same tab: the link contract carries NO target/rel.
  const linkBlock = capsuleRoute.slice(capsuleRoute.indexOf("CAPSULE_MUSIC_LINK"));
  assert.ok(!/target:/.test(linkBlock), "CAPSULE link must not open a new tab");
});

test("desktop music nav renders CAPSULE via the shared link → the teaser", () => {
  assert.match(nav, /CAPSULE_MUSIC_LINK/);
  assert.ok(!/target="_blank"[^>]*CAPSULE|CAPSULE[^<]*target="_blank"/.test(nav));
});

test("mobile music nav renders CAPSULE via the shared link → the teaser", () => {
  assert.match(mobileNav, /CAPSULE_MUSIC_LINK/);
});

test("NO music nav links directly to the real WIP shop (/capsule or its subroutes)", () => {
  for (const [name, src] of [["Nav", nav], ["MobileNav", mobileNav]]) {
    assert.ok(!/\/capsule\//.test(src), `${name} must not link into /capsule/*`);
    // The bare shop path "/capsule" (as a full string literal) must not appear —
    // only "/capsule-coming-soon" is allowed, and it lives in capsuleRoute.ts.
    assert.ok(!/["']\/capsule["']/.test(src), `${name} must not link to the shop /capsule`);
  }
});

test("route-aware logo: shop → /capsule, Coming Soon → / (single header, no duplicate)", () => {
  assert.match(capsuleHeader, /const logoHref = comingSoon \? "\/" : "\/capsule"/);
  // One logo <Link>, its href driven by the variant (not two hard-coded logos).
  assert.equal((capsuleHeader.match(/<Link className={styles\.logoLink}/g) || []).length, 1);
  assert.match(capsuleHeader, /href={logoHref}/);
});
