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
    defaultColorId: "white",
    colors: [
      {
        id: "black",
        label: "Black",
        swatch: "#000000",
        front: `${BASE}/guided-white-front.jpg`,
        frontAlt: "Guided Tee — front, worn by a model",
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

/**
 * Capsule LANDING data (Figma 285-2079 / 285-1883): the two big image links +
 * their view-cursor labels. Images live under /public/assets/capsule.
 */
export const CAPSULE_LANDING = {
  mens: {
    href: "/capsule/mens",
    image: `${BASE}/landing-mens.jpg`,
    alt: "Enter the MENS capsule collection",
    cursor: "[VIEW MENS]",
    label: "View the MENS collection",
  },
  womens: {
    href: "/capsule/womens",
    image: `${BASE}/landing-womens.jpg`,
    alt: "Enter the WOMENS capsule collection",
    cursor: "[VIEW WOMENS]",
    label: "View the WOMENS collection",
  },
  marqueeText: "GUIDED BY FREQUENCY",
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
