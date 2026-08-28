"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { CapsuleProduct, CapsuleSize } from "@/data/capsule";
import {
  CAPSULE_CATALOG,
  formatPrice,
  variantGallery,
  productBreadcrumb,
} from "@/data/capsule";
import { useCapsuleCart } from "./CapsuleCartContext";
import CapsuleHeader from "./CapsuleHeader";
import ProductCarousel from "./ProductCarousel";
import Accordion from "./Accordion";
import styles from "./capsule.module.css";

/** Breadcrumb chevron — exact Figma glyph (node 283-717), inlined for currentColor. */
function ChevronLeft() {
  return (
    <svg
      className={styles.crumbChevron}
      viewBox="0 0 4.88086 8.625"
      width="5"
      height="9"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M0.175781 3.90234L3.92578 0.175781C4.13672 -0.0585938 4.48828 -0.0585938 4.72266 0.175781C4.93359 0.386719 4.93359 0.738281 4.72266 0.949219L1.34766 4.30078L4.69922 7.67578C4.93359 7.88672 4.93359 8.23828 4.69922 8.44922C4.48828 8.68359 4.13672 8.68359 3.92578 8.44922L0.175781 4.69922C-0.0585938 4.48828 -0.0585938 4.13672 0.175781 3.90234Z" />
    </svg>
  );
}

/**
 * CAPSULE single-product page (Figma 266-586 desktop / 285-813 mobile). Desktop:
 * fixed info container 64px-left + vertically centred, carousel clipped on the
 * right. Mobile: breadcrumb, horizontal-swipe gallery, then title+price, colour,
 * DESCRIPTION/COMPOSITION accordions, sizing and a full-width CTA.
 *
 * Breadcrumb returns to the correct COLLECTION (/capsule/mens|womens), not the
 * landing — labelled "HOME" on desktop and "TEE" on mobile per the two frames.
 * Reuses the shared cart, header, catalogue, size toggle + no-shift SELECT A SIZE.
 */
export default function ProductView({ product }: { product: CapsuleProduct }) {
  const { add, drawerOpen } = useCapsuleCart();
  const [selectedId, setSelectedId] = useState(
    product.defaultColorId ?? product.colors[0].id,
  );
  const [selectedSize, setSelectedSize] = useState<CapsuleSize | null>(null);
  const [needsSize, setNeedsSize] = useState(false);
  const firstSizeRef = useRef<HTMLButtonElement>(null);

  const selected =
    product.colors.find((c) => c.id === selectedId) ?? product.colors[0];
  // Single-product gallery is STATIC — no hover swap. The front/back hover reveal is
  // a COLLECTION-hub behaviour only (ProductCard); the product-detail gallery just
  // shows the ordered gallery images (with color-variant switching + carousel).
  const gallery = variantGallery(selected);
  const tabs = CAPSULE_CATALOG[product.gender].tabs;
  const crumb = productBreadcrumb(product);

  const handleAdd = () => {
    if (!selectedSize) {
      setNeedsSize(true);
      firstSizeRef.current?.focus();
      return;
    }
    add({
      productId: product.id,
      name: product.title,
      colorId: selected.id,
      colorLabel: selected.label,
      size: selectedSize,
      unitPrice: product.price,
      thumb: selected.front,
      thumbAlt: selected.frontAlt,
    });
  };

  // Category-based breadcrumb (Figma 266-618 desktop / 285-2068 mobile): the "‹ TEE"
  // control is a real link back to the product's own collection (audience preserved,
  // category active); the current product title is aria-current and not a link. The
  // "/" separator is drawn by CSS between the two <li>s. Same structure both breakpoints.
  const breadcrumb = (cls: string) => (
    <nav className={cls} aria-label="Breadcrumb">
      <ol className={styles.breadcrumbList}>
        <li className={styles.breadcrumbItem}>
          <Link className={styles.breadcrumbLink} href={crumb.href}>
            <ChevronLeft />
            {crumb.categoryLabel}
          </Link>
        </li>
        <li className={styles.breadcrumbItem}>
          <span className={styles.breadcrumbCurrent} aria-current="page">
            {crumb.title}
          </span>
        </li>
      </ol>
    </nav>
  );

  return (
    <div className={styles.page} data-drawer-open={drawerOpen ? "" : undefined}>
      <CapsuleHeader
        menu={{ activeGender: product.gender, activeCategory: product.category, tabs }}
      />

      <main className={styles.productMain}>
        {/* Mobile-only breadcrumb (above the gallery): "‹ TEE / <title>". */}
        {breadcrumb(styles.crumbStandalone)}

        <ProductCarousel images={gallery} />

        {/* Product information container split into explicit regions (Figma 289-704/
            779/854). On desktop the container is a fixed-height flex column: the top
            group + accordion region + purchase region. The accordion region is BOUNDED
            (flex:1, its content expands/scrolls INSIDE it), so toggling DESCRIPTION /
            COMPOSITION never moves the purchase region — sizing and the CTA keep a
            fixed position with a structural 52px gap, and there is no layout shift. */}
        <section className={styles.productInfo} aria-label={product.title}>
          {/* Regions 1–3: breadcrumb, title + price, colour selector. */}
          <div className={styles.productInfoTop}>
            {/* Desktop-only breadcrumb (top of the info column): "‹ TEE / <title>". */}
            {breadcrumb(styles.crumbInInfo)}

            <div className={styles.productTitleRow}>
              <h1 className={styles.productHeading}>{product.title}</h1>
              <span className={styles.productTitlePrice}>
                {formatPrice(product.price)}
              </span>
            </div>

            <div
              className={styles.swatches20}
              role="group"
              aria-label={`${product.title} colour`}
            >
              {product.colors.map((c) => {
                const isSelected = c.id === selectedId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={styles.swatch20}
                    aria-pressed={isSelected}
                    aria-label={`${c.label}${isSelected ? " (selected)" : ""}`}
                    data-bordered={c.swatchBorder ? "" : undefined}
                    onClick={() => setSelectedId(c.id)}
                    style={{ ["--swatch" as string]: c.swatch }}
                  />
                );
              })}
            </div>
          </div>

          {/* Region 4: accordions. Bounded region — always mounted (so the purchase
              region below keeps a fixed position even when a product has no copy).
              Opening a panel expands within here (internal scroll if it ever exceeds),
              never pushing sizing/CTA. Both start CLOSED; slug-based keys remount them
              on product change so navigating always resets to closed. */}
          <div className={styles.accordionRegion}>
            {(product.description?.length || product.composition?.length) && (
              <div className={styles.desc}>
                {product.description && product.description.length > 0 && (
                  <Accordion
                    key={`${product.slug}-description`}
                    title="Description"
                    items={product.description}
                  />
                )}
                {product.composition && product.composition.length > 0 && (
                  <Accordion
                    key={`${product.slug}-composition`}
                    title="Composition"
                    items={product.composition}
                  />
                )}
              </div>
            )}
          </div>

          {/* Region 5: fixed purchase region — sizing, 52px gap, CTA, validation.
              Position-independent of the accordion state (Figma 52px size→CTA gap). */}
          <div className={styles.purchaseRegion}>
            <div
              className={styles.sizing}
              role="group"
              aria-label={`${product.title} size`}
            >
              {product.sizes.map((size, i) => {
                const isSelected = size === selectedSize;
                return (
                  <button
                    key={size}
                    ref={i === 0 ? firstSizeRef : undefined}
                    type="button"
                    className={styles.sizeBox}
                    aria-pressed={isSelected}
                    aria-label={`Size ${size}${isSelected ? " (selected)" : ""}`}
                    onClick={() => {
                      setSelectedSize((prev) => (prev === size ? null : size));
                      setNeedsSize(false);
                    }}
                  >
                    <span className={styles.sizeBoxLabel}>{size}</span>
                  </button>
                );
              })}
            </div>

            {/* CTA shows the action only — the price lives in the title row above
                (Figma node 283-713). Price stays in the catalogue + cart. */}
            <div className={styles.ctaRow}>
              <button
                type="button"
                className={styles.preorder}
                onClick={handleAdd}
                aria-label={
                  selectedSize
                    ? `Add ${product.title} (${selected.label}, size ${selectedSize}) to cart`
                    : `Add ${product.title} to cart — select a size first`
                }
              >
                ADD TO CART
              </button>
            </div>

            {/* Validation is absolutely positioned → it never shifts the CTA/sizing. */}
            <p className={styles.sizeHint} role="alert" data-show={needsSize ? "" : undefined}>
              SELECT A SIZE
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
