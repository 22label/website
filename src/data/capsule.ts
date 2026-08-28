/**
 * Typed facade over the CAPSULE catalogue. The DATA + pure helpers live in
 * ./capsuleCatalog.mjs (single source of truth, unit-testable). This file layers
 * the TypeScript types on top and re-exports the values so components get full
 * typing while there is exactly one data source. Do NOT add product data here.
 */
import * as catalog from "./capsuleCatalog.mjs";

export type CapsuleGender = "mens" | "womens";
export type CapsuleCategory = "tee" | "hoodie" | "cap";
export type CapsuleSize = "S" | "M" | "L" | "XL";

export interface ProductColor {
  id: string;
  label: string;
  swatch: string;
  swatchBorder?: boolean;
  front: string;
  frontAlt: string;
  back?: string;
  backAlt?: string;
  /** Ordered carousel gallery; falls back to [front, back] (see variantGallery). */
  gallery?: string[];
  galleryAlt?: string[];
}

export interface CapsuleProduct {
  id: string;
  /** Explicit, stable URL slug (never derived from the display title at runtime). */
  slug: string;
  title: string;
  price: number;
  category: CapsuleCategory;
  gender: CapsuleGender;
  colors: ProductColor[];
  sizes: CapsuleSize[];
  defaultColorId?: string;
  /** Product-page accordion copy — distinct fields (only where Figma supplies it). */
  description?: string[];
  composition?: string[];
}

export interface CapsuleCategoryTab {
  id: CapsuleCategory;
  label: string;
  comingSoon?: boolean;
}

export interface CapsuleLandingSide {
  href: string;
  image: string;
  imageMobile: string;
  alt: string;
  cursor: string;
  label: string;
}
export interface CapsuleLanding {
  mens: CapsuleLandingSide;
  womens: CapsuleLandingSide;
  marqueeText: string;
}

export const ALL_SIZES = catalog.ALL_SIZES as CapsuleSize[];
export const formatPrice = catalog.formatPrice as (eur: number) => string;
export const formatEuro = catalog.formatEuro as (eur: number) => string;

export const MENS_TEES = catalog.MENS_TEES as CapsuleProduct[];
export const WOMENS_TEES = catalog.WOMENS_TEES as CapsuleProduct[];
export const MENS_CATEGORY_TABS = catalog.MENS_CATEGORY_TABS as CapsuleCategoryTab[];

export const CAPSULE_CATALOG = catalog.CAPSULE_CATALOG as Record<
  CapsuleGender,
  { products: CapsuleProduct[]; tabs: CapsuleCategoryTab[] }
>;

export const ALL_PRODUCTS = catalog.ALL_PRODUCTS as CapsuleProduct[];
export const ALL_CAPSULE_IMAGES = catalog.ALL_CAPSULE_IMAGES as string[];

export const getProductBySlug = catalog.getProductBySlug as (
  slug: string,
) => CapsuleProduct | undefined;
export const allProductSlugs = catalog.allProductSlugs as () => string[];
export const collectionHref = catalog.collectionHref as (
  gender: CapsuleGender,
) => string;
export const productHref = catalog.productHref as (slug: string) => string;
export const categoryLabel = catalog.categoryLabel as (
  category: CapsuleCategory,
) => string;
export const productBreadcrumb = catalog.productBreadcrumb as (
  product: CapsuleProduct,
) => { categoryLabel: string; href: string; title: string };
export const CAPSULE_LANDING = catalog.CAPSULE_LANDING as CapsuleLanding;
export const CAPSULE_COMING_SOON = catalog.CAPSULE_COMING_SOON as {
  mens: string;
  womens: string;
  mensMobileBase: string;
  mensMobileCutout: string;
};
export const variantGallery = catalog.variantGallery as (
  color: ProductColor,
) => { src: string; alt: string }[];
