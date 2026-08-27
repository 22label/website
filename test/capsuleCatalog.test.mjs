import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAPSULE_CATALOG,
  ALL_PRODUCTS,
  getProductBySlug,
  allProductSlugs,
  variantGallery,
  collectionHref,
  productHref,
} from "../src/data/capsuleCatalog.mjs";

test("every product has a stable, unique, non-empty slug", () => {
  const slugs = allProductSlugs();
  assert.equal(slugs.length, ALL_PRODUCTS.length);
  assert.ok(slugs.every((s) => typeof s === "string" && s.length > 0));
  assert.equal(new Set(slugs).size, slugs.length); // unique
});

test("hub product ids match their slugs (image link targets the right page)", () => {
  // Each hub card links to /capsule/<slug>; the slug must resolve back to it.
  for (const p of ALL_PRODUCTS) {
    const found = getProductBySlug(p.slug);
    assert.ok(found, `slug ${p.slug} resolves`);
    assert.equal(found.id, p.id);
  }
});

test("known MENS slugs resolve to the expected products", () => {
  assert.equal(getProductBySlug("22-tee")?.title, "22 TEE");
  assert.equal(getProductBySlug("signal-tee")?.title, "SIGNAL TEE");
  assert.equal(getProductBySlug("guided-tee")?.title, "GUIDED TEE");
});

test("an unknown slug returns undefined (→ route 404)", () => {
  assert.equal(getProductBySlug("does-not-exist"), undefined);
  assert.equal(getProductBySlug(""), undefined);
});

test("product page reads price/variants/sizes from the SAME catalogue object", () => {
  // getProductBySlug returns the very object held in CAPSULE_CATALOG (no copy /
  // second source), so the product page can never drift from the hub.
  const fromCatalog = CAPSULE_CATALOG.mens.products.find((p) => p.slug === "signal-tee");
  const fromLookup = getProductBySlug("signal-tee");
  assert.equal(fromLookup, fromCatalog); // identity, not just deep-equal
  assert.equal(fromLookup.price, 79);
  assert.deepEqual(
    fromLookup.colors.map((c) => c.id),
    ["black", "cream"],
  );
  assert.deepEqual(fromLookup.sizes, ["S", "M", "L", "XL"]);
});

test("22 TEE cream exposes the real 4-image Figma gallery, in order", () => {
  const p = getProductBySlug("22-tee");
  const cream = p.colors.find((c) => c.id === "cream");
  const g = variantGallery(cream);
  assert.equal(g.length, 4);
  assert.ok(g.every((x) => x.src.endsWith(".jpg") && x.alt.length > 0));
  assert.deepEqual(
    g.map((x) => x.src),
    [
      "/assets/capsule/22tee-cream-1.jpg",
      "/assets/capsule/22tee-cream-2.jpg",
      "/assets/capsule/22tee-cream-3.jpg",
      "/assets/capsule/22tee-cream-4.jpg",
    ],
  );
});

test("variantGallery falls back to [front, back] — never invents/pads to four", () => {
  const signal = getProductBySlug("signal-tee");
  const black = signal.colors.find((c) => c.id === "black");
  const cream = signal.colors.find((c) => c.id === "cream");
  assert.deepEqual(variantGallery(black).map((x) => x.src), [black.front, black.back]);
  // Cream has no back → a single real image, not a duplicated pad.
  assert.deepEqual(variantGallery(cream).map((x) => x.src), [cream.front]);
});

test("gallery differs per colour variant (colour change updates the carousel)", () => {
  const signal = getProductBySlug("signal-tee");
  const black = signal.colors.find((c) => c.id === "black");
  const cream = signal.colors.find((c) => c.id === "cream");
  assert.notDeepEqual(
    variantGallery(black).map((x) => x.src),
    variantGallery(cream).map((x) => x.src),
  );
});

test("explicit routes: collectionHref per audience + productHref per slug", () => {
  assert.equal(collectionHref("mens"), "/capsule/mens");
  assert.equal(collectionHref("womens"), "/capsule/womens");
  assert.equal(productHref("22-tee"), "/capsule/product/22-tee");
  assert.equal(productHref("signal-tee"), "/capsule/product/signal-tee");
});

test("breadcrumb returns to the product's own collection (not the landing)", () => {
  // Reconstructed from catalogue data → correct on a direct refresh.
  assert.equal(collectionHref(getProductBySlug("signal-tee").gender), "/capsule/mens");
  assert.equal(collectionHref(getProductBySlug("22-tee").gender), "/capsule/mens");
  assert.equal(collectionHref(getProductBySlug("womens-tee-2").gender), "/capsule/womens");
});

test("no product slug collides with the mens/womens collection segments", () => {
  const slugs = allProductSlugs();
  assert.ok(!slugs.includes("mens"));
  assert.ok(!slugs.includes("womens"));
});

test("price stays in the catalogue for every product (SPP / CTA / cart use it)", () => {
  // The hub hides the price visually (summary variant) but it must remain in the
  // shared data for the single-product page CTA, cart line items and totals.
  for (const p of ALL_PRODUCTS) {
    assert.equal(typeof p.price, "number");
    assert.ok(p.price > 0, `${p.slug} has a positive price`);
  }
  assert.equal(getProductBySlug("22-tee").price, 119);
  assert.equal(getProductBySlug("signal-tee").price, 79);
  assert.equal(getProductBySlug("guided-tee").price, 89);
});

test("22 TEE exposes distinct description + composition copy (accordion source)", () => {
  const p = getProductBySlug("22-tee");
  assert.ok(Array.isArray(p.description) && p.description.length === 5);
  assert.ok(Array.isArray(p.composition) && p.composition.length === 2);
  assert.equal(p.description[0], "Fit: Oversized");
  assert.ok(p.composition[0].startsWith("Shell:"));
  // Other products have no copy yet (not invented) — flagged in the report.
  assert.equal(getProductBySlug("signal-tee").description, undefined);
  assert.equal(getProductBySlug("womens-tee-1").composition, undefined);
});
