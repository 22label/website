/**
 * Data-driven CAPSULE 22 catalogue. The MENS TEE collection is populated now; the
 * typed shape is intentionally general so WOMENS, HOODIE, CAP, additional colours
 * and dedicated product pages can be added later WITHOUT touching the components.
 *
 * Product images live under /public/assets/capsule (exported from the Figma file
 * KXvqqUaMZcBEl8UFrHi56M). Each colour carries its own front image and, where the
 * design provides one, a back image used for the hover crossfade.
 */

export type CapsuleGender = "mens" | "womens";
export type CapsuleCategory = "tee" | "hoodie" | "cap";

export interface ProductColor {
  /** Stable id (used as the selected-state key + variant key). */
  id: string;
  /** Human label for accessible names ("Black", "Cream", "White"). */
  label: string;
  /** Selector swatch fill (from Figma). */
  swatch: string;
  /** Draw a hairline ring so a near-white swatch reads on the cream page. */
  swatchBorder?: boolean;
  /** Front image (shown at rest). */
  front: string;
  frontAlt: string;
  /** Optional back image, revealed on hover (hover-capable devices only). */
  back?: string;
  backAlt?: string;
}

export interface CapsuleProduct {
  id: string;
  title: string;
  /** Price in EUR (whole euros in the current line). */
  price: number;
  category: CapsuleCategory;
  gender: CapsuleGender;
  /** Selectable colours, in display order. */
  colors: ProductColor[];
  /** Initially-selected colour id; defaults to the first colour when omitted. */
  defaultColorId?: string;
}

export interface CapsuleCategoryTab {
  id: CapsuleCategory;
  label: string;
  /** Not yet shopping-ready — shown with a COMING SOON pill, not linked. */
  comingSoon?: boolean;
}

export const formatPrice = (eur: number): string => `€${eur}`;

const BASE = "/assets/capsule";

/**
 * MENS TEE collection. NOTE on assets: the Figma file only ships a complete set
 * of renders for the SIGNAL TEE (black front + black back + cream front). The
 * 22 TEE (single cream colour) and GUIDED TEE (white front only) have no back or
 * alternate-colour renders yet — those variants are wired but reuse the available
 * front until the missing images are supplied. See the report accompanying this
 * change.
 */
export const MENS_TEES: CapsuleProduct[] = [
  {
    id: "22-tee",
    title: "22 TEE",
    price: 119,
    category: "tee",
    gender: "mens",
    colors: [
      {
        id: "cream",
        label: "Cream",
        swatch: "#F1E8DD",
        swatchBorder: true,
        front: `${BASE}/22tee-cream-front.jpg`,
        frontAlt: "22 Tee in cream — front, worn by a model",
      },
    ],
  },
  {
    id: "signal-tee",
    title: "SIGNAL TEE",
    price: 79,
    category: "tee",
    gender: "mens",
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
    title: "GUIDED TEE",
    price: 89,
    category: "tee",
    gender: "mens",
    // Figma swatch order is black then white, but only the white colourway has a
    // render, so white is the default shown state (truthful selected state).
    defaultColorId: "white",
    colors: [
      {
        id: "black",
        label: "Black",
        swatch: "#000000",
        // No dedicated black render in Figma yet → falls back to the white front.
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

export const MENS_CATEGORY_TABS: CapsuleCategoryTab[] = [
  { id: "tee", label: "TEE" },
  { id: "hoodie", label: "HOODIE", comingSoon: true },
  { id: "cap", label: "CAP", comingSoon: true },
];
