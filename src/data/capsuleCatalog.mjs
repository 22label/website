/**
 * CAPSULE 22 catalogue DATA + pure helpers — the single source of truth for the
 * hub, single-product page, cart drawer, thumbnails, selectors and prices. Kept as
 * a pure .mjs module (repo convention) so the data + lookups are unit-testable and
 * consumed identically by every surface. `capsule.ts` is the typed facade over
 * this file; components import from there.
 *
 * Product images live under /public/assets/capsule (exported from Figma file
 * KXvqqUaMZcBEl8UFrHi56M).
 *
 * @typedef {"mens"|"womens"} CapsuleGender
 * @typedef {"tee"|"hoodie"|"cap"} CapsuleCategory
 * @typedef {"S"|"M"|"L"|"XL"} CapsuleSize
 */

export const ALL_SIZES = ["S", "M", "L", "XL"];

/** €119 → "€119". Whole-euro line prices (as drawn on the cards). */
export const formatPrice = (eur) => `€${eur}`;

/** 6.99 → "€6,99". European comma decimals for shipping + total (drawer). */
export const formatEuro = (eur) => `€${eur.toFixed(2).replace(".", ",")}`;

const BASE = "/assets/capsule";

export const MENS_TEES = [
  {
    id: "22-tee",
    slug: "22-tee",
    title: "22 TEE",
    price: 119,
    category: "tee",
    gender: "mens",
    sizes: ALL_SIZES,
    // Distinct fields (Figma 285-1503). Only the 22 TEE has real copy in Figma;
    // the other products have none yet (see report).
    description: [
      "Fit: Oversized",
      "1x1 rib mock-neck collar",
      "Self-fabric back neck tape",
      "Set-in sleeves with dropped shoulders",
      "Twin-needle topstitching at sleeve cuffs and hem",
    ],
    composition: [
      "Shell: Single Jersey, 100% Cotton - Organic Ring Spun Combed, Fabric washed",
      "Weight: 200 GSM",
    ],
    colors: [
      {
        id: "cream",
        label: "Cream",
        swatch: "#F1E8DD",
        swatchBorder: true,
        front: `${BASE}/22tee-cream-front.jpg`,
        frontAlt: "22 Tee in cream — front, worn by a model",
        // Collection-hub hover/back (Figma 289-698, "22T_back") — same portrait crop
        // as the front so the ProductCard crossfade never shifts. This drives the HUB
        // hover only; the single-product gallery uses the explicit `gallery` below.
        back: `${BASE}/22tee-back.jpg`,
        backAlt: "22 Tee in cream — back, with 22 print, worn by a model",
        // Real 4-image gallery from Figma (node 282-780).
        gallery: [
          `${BASE}/22tee-cream-1.jpg`,
          `${BASE}/22tee-cream-2.jpg`,
          `${BASE}/22tee-cream-3.jpg`,
          `${BASE}/22tee-cream-4.jpg`,
        ],
        galleryAlt: [
          "22 Tee in cream — front, worn by a model",
          "22 Tee in cream — back, with 22 print",
          "22 Tee in cream — 2HOT2HANDLE chest print detail",
          "22 Tee in cream — back neck label and 22 print detail",
        ],
      },
    ],
  },
  {
    id: "signal-tee",
    slug: "signal-tee",
    title: "SIGNAL TEE",
    price: 79,
    category: "tee",
    gender: "mens",
    sizes: ALL_SIZES,
    colors: [
      {
        id: "black",
        label: "Black",
        swatch: "#000000",
        front: `${BASE}/signal-black-front.jpg`,
        frontAlt: "Signal Tee in black — front, worn by a model",
        back: `${BASE}/signal-black-back.jpg`,
        backAlt: "Signal Tee in black — back, with 2HOT2HANDLE print",
      },
      {
        id: "cream",
        label: "Cream",
        swatch: "#FFF7ED",
        swatchBorder: true,
        front: `${BASE}/signal-cream-front.jpg`,
        frontAlt: "Signal Tee in cream — front, worn by a model",
      },
    ],
  },
  {
    id: "guided-tee",
    slug: "guided-tee",
    title: "GUIDED TEE",
    price: 89,
    category: "tee",
    gender: "mens",
    sizes: ALL_SIZES,
    // Definitive SPP (Figma 289-854 / carousel-guided-tee-black) shows the BLACK
    // variant with a real front + back (exported as GUIDEDT_front_B / GUIDEDT_back_B).
    defaultColorId: "black",
    colors: [
      {
        id: "black",
        label: "Black",
        swatch: "#000000",
        front: `${BASE}/guided-black-front.jpg`,
        frontAlt: "Guided Tee in black — front, worn by a model",
        back: `${BASE}/guided-black-back.jpg`,
        backAlt:
          "Guided Tee in black — back, with GUIDED BY FREQUENCY / praying hands / 22 print",
      },
      {
        id: "white",
        label: "White",
        swatch: "#FFFFFF",
        swatchBorder: true,
        front: `${BASE}/guided-white-front.jpg`,
        frontAlt: "Guided Tee in white — front, worn by a model",
      },
    ],
  },
];

export const WOMENS_TEES = [
  {
    id: "womens-tee-1",
    slug: "womens-tee-1",
    title: "22 TEE",
    price: 119,
    category: "tee",
    gender: "womens",
    sizes: ALL_SIZES,
    colors: [
      {
        id: "cream",
        label: "Cream",
        swatch: "#F1E8DD",
        swatchBorder: true,
        front: `${BASE}/womens-black-tee-front.jpg`,
        frontAlt: "22 Tee — black, front, worn by a model",
      },
    ],
  },
  {
    id: "womens-tee-2",
    slug: "womens-tee-2",
    title: "22 TEE",
    price: 119,
    category: "tee",
    gender: "womens",
    sizes: ALL_SIZES,
    colors: [
      {
        id: "cream",
        label: "Cream",
        swatch: "#F1E8DD",
        swatchBorder: true,
        front: `${BASE}/womens-cream-ls-front.jpg`,
        frontAlt: "22 Longsleeve — cream, front, worn by a model",
      },
    ],
  },
  {
    id: "womens-tee-3",
    slug: "womens-tee-3",
    title: "22 TEE",
    price: 119,
    category: "tee",
    gender: "womens",
    sizes: ALL_SIZES,
    colors: [
      {
        id: "cream",
        label: "Cream",
        swatch: "#F1E8DD",
        swatchBorder: true,
        front: `${BASE}/womens-black-tee-back.jpg`,
        frontAlt: "22 Tee — black, back with 2HOT2HANDLE / GUIDED BY FREQUENCY print",
      },
    ],
  },
];

const TEE_TABS = [
  { id: "tee", label: "TEE" },
  { id: "hoodie", label: "HOODIE", comingSoon: true },
  { id: "cap", label: "CAP", comingSoon: true },
];

export const MENS_CATEGORY_TABS = TEE_TABS;

export const CAPSULE_CATALOG = {
  mens: { products: MENS_TEES, tabs: TEE_TABS },
  womens: { products: WOMENS_TEES, tabs: TEE_TABS },
};

export const ALL_PRODUCTS = Object.values(CAPSULE_CATALOG).flatMap((c) => c.products);

/** Every hub image URL (fronts + backs) across both audiences — used to preload. */
export const ALL_CAPSULE_IMAGES = ALL_PRODUCTS.flatMap((p) =>
  p.colors.flatMap((c) => (c.back ? [c.front, c.back] : [c.front])),
);

/** Look up a product by its explicit slug (used by the dynamic route). */
export function getProductBySlug(slug) {
  return ALL_PRODUCTS.find((p) => p.slug === slug);
}

/** Every slug — for generateStaticParams / tests. */
export function allProductSlugs() {
  return ALL_PRODUCTS.map((p) => p.slug);
}

/** Collection route for an audience (explicit, unambiguous). */
export function collectionHref(gender) {
  return gender === "womens" ? "/capsule/womens" : "/capsule/mens";
}

/** Single-product route for a slug. */
export function productHref(slug) {
  return `/capsule/product/${slug}`;
}

/** Display label for a product category (TEE / HOODIE / CAP) from the tab table. */
export function categoryLabel(category) {
  const tab = TEE_TABS.find((t) => t.id === category);
  return tab ? tab.label : String(category).toUpperCase();
}

/**
 * Category-based breadcrumb model for a product (Figma 283-713 desktop / 285-2068
 * mobile: "‹ TEE / <title>"). The "previous" control is the product's CATEGORY,
 * linking back to that category's collection while preserving the AUDIENCE — a TEE
 * MENS product returns to the MENS collection (TEE active), a TEE WOMENS product to
 * the WOMENS collection. Reconstructed purely from catalogue data, so it is correct
 * on a direct refresh (never relies on browser history). Category is currently
 * implicit in the collection (TEE is the only/active category); when HOODIE/CAP ship
 * the same shape applies and `href` is where a `?category=` would attach.
 */
export function productBreadcrumb(product) {
  return {
    categoryLabel: categoryLabel(product.category),
    href: collectionHref(product.gender),
    title: product.title,
  };
}

/**
 * Capsule LANDING data — the two big images + their view-cursor labels. Desktop and
 * mobile use DISTINCT exports with different crops (not one image cropped by CSS):
 *  - desktop MENS 289-1230 / WOMENS 289-1231 (854×788 frame, full-body framing)
 *  - mobile  MENS 289-1228 / WOMENS 289-1229 (375×333 frame, tighter upper-body)
 * The component swaps them with <picture>+media so only the matching asset loads
 * (no desktop→mobile flash). Same mapping powers both /capsule and the teaser.
 */
export const CAPSULE_LANDING = {
  mens: {
    href: "/capsule/mens",
    image: `${BASE}/landing-mens-desktop.jpg`,
    imageMobile: `${BASE}/landing-mens-mobile.jpg`,
    alt: "Enter the MENS capsule collection",
    cursor: "[VIEW MENS]",
    label: "View the MENS collection",
  },
  womens: {
    href: "/capsule/womens",
    image: `${BASE}/landing-womens-desktop.jpg`,
    imageMobile: `${BASE}/landing-womens-mobile.jpg`,
    alt: "Enter the WOMENS capsule collection",
    cursor: "[VIEW WOMENS]",
    label: "View the WOMENS collection",
  },
  marqueeText: "GUIDED BY FREQUENCY",
};

/**
 * Coming Soon TEASER images (Figma 290-1288 MENS / 290-1289 WOMENS) — a SEPARATE
 * asset set from the shop landing above, so /capsule keeps its own approved visuals
 * and can never be changed by editing these. Each node is a single export used at
 * BOTH breakpoints (same visual desktop + mobile); the crop differs only via the
 * container aspect + object-fit. Only /capsule-coming-soon reads these.
 */
export const CAPSULE_COMING_SOON = {
  mens: `${BASE}/coming-soon-mens.jpg`,
  womens: `${BASE}/coming-soon-womens.jpg`,
};

/**
 * Ordered carousel gallery for a colour variant. Uses the variant's own `gallery`
 * when Figma supplies one, else falls back to the real [front, back] renders — it
 * NEVER invents or duplicates an image to pad to four.
 */
export function variantGallery(color) {
  if (color.gallery && color.gallery.length) {
    return color.gallery.map((src, i) => ({
      src,
      alt: (color.galleryAlt && color.galleryAlt[i]) || color.frontAlt,
    }));
  }
  const out = [{ src: color.front, alt: color.frontAlt }];
  if (color.back) out.push({ src: color.back, alt: color.backAlt || color.frontAlt });
  return out;
}
