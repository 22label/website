"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { CapsuleProduct, CapsuleSize } from "@/data/capsule";
import { formatPrice, productHref } from "@/data/capsule";
import styles from "./capsule.module.css";

/** The self-contained line item a card emits when its + ADD is pressed. */
export interface AddToCartInput {
  productId: string;
  name: string;
  colorId: string;
  colorLabel: string;
  size: CapsuleSize;
  unitPrice: number;
  thumb: string;
  thumbAlt: string;
}

/**
 * One product in the CAPSULE collection. Colour selectors are real buttons that
 * crossfade the front image; on hover-capable devices the image crossfades to the
 * matching back (the pairing always follows the selected colour). Touch cannot get
 * stuck in the hover state — the hover reveal is gated to mouse pointers. All
 * colour layers are rendered as stacked <img> so every variant is preloaded and
 * the opacity crossfade never flashes.
 *
 * Sizes are real toggle buttons: click an unselected size to pick it, click the
 * selected size again to clear it (at most one selected per card). No default is
 * pre-selected, so + ADD is blocked until a size is chosen; only THEN (a failed
 * add) does the right-aligned "SELECT A SIZE" prompt appear. The prompt is
 * absolutely positioned so it can never shift the grid. Changing colour never
 * clears the size; each card owns its own state.
 *
 * PRESENTATION VARIANTS (a typed prop, not CSS/position hacks):
 *  - "summary" (Capsule Hub): image + a single centred title. Price, the colour /
 *    size / + ADD / SELECT A SIZE row are simply not rendered — no reserved space,
 *    no validation. Purchasing (and the price) live on the single-product page.
 *  - "full" (default): title + price + every purchase control. The rows + their
 *    logic stay intact in this component and can be reused anywhere; nothing is
 *    deleted, and `price` is still read here for the full layout.
 */
export default function ProductCard({
  product,
  onAdd,
  variant = "full",
}: {
  product: CapsuleProduct;
  onAdd?: (line: AddToCartInput) => void;
  variant?: "summary" | "full";
}) {
  const summary = variant === "summary";
  const [selectedId, setSelectedId] = useState(
    product.defaultColorId ?? product.colors[0].id,
  );
  const [selectedSize, setSelectedSize] = useState<CapsuleSize | null>(null);
  const [needsSize, setNeedsSize] = useState(false);
  const [hovered, setHovered] = useState(false);
  const firstSizeRef = useRef<HTMLButtonElement>(null);

  const selected =
    product.colors.find((c) => c.id === selectedId) ?? product.colors[0];
  const showBack = hovered && !!selected.back;

  const handleAdd = () => {
    if (!selectedSize) {
      // Safe path: require an explicit size. Surface why + move focus to sizes.
      setNeedsSize(true);
      firstSizeRef.current?.focus();
      return;
    }
    onAdd?.({
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

  return (
    <article className={styles.card}>
      <Link
        className={styles.imageWrap}
        href={productHref(product.slug)}
        aria-label={`View details for ${product.title}`}
        data-hub-cursor-zone=""
        data-cursor-label="[OPEN]"
        draggable={false}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") setHovered(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setHovered(false);
        }}
        onPointerCancel={() => setHovered(false)}
      >
        {product.colors.map((c) => {
          const isSelected = c.id === selectedId;
          // Selected front is visible unless the back is crossing in on hover.
          const frontVisible = isSelected && !(showBack && c.id === selectedId);
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${c.id}-front`}
              className={styles.layer}
              src={c.front}
              alt={isSelected ? c.frontAlt : ""}
              width={427}
              height={570}
              draggable={false}
              aria-hidden={!frontVisible}
              style={{ opacity: frontVisible ? 1 : 0 }}
            />
          );
        })}

        {selected.back && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className={styles.layer}
            src={selected.back}
            alt={showBack ? selected.backAlt ?? "" : ""}
            width={427}
            height={570}
            draggable={false}
            aria-hidden={!showBack}
            style={{ opacity: showBack ? 1 : 0 }}
          />
        )}
      </Link>

      <div className={styles.info}>
        {summary ? (
          // Hub: centred title only (full image width), no price.
          <div className={styles.summaryTitle}>
            <span className={styles.productTitle}>{product.title}</span>
          </div>
        ) : (
          <div className={styles.infoRow}>
            <span className={styles.productTitle}>{product.title}</span>
            <span className={styles.price}>{formatPrice(product.price)}</span>
          </div>
        )}

        {/* Second row (purchase controls) — rendered only in the "full" variant.
            Not deleted: the Hub uses variant="summary", so this simply isn't
            mounted there (no reserved space, no validation). */}
        {!summary && (
        <div className={styles.infoRow}>
          <div
            className={styles.swatches}
            role="group"
            aria-label={`${product.title} colour`}
          >
            {product.colors.map((c) => {
              const isSelected = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={styles.swatch}
                  aria-pressed={isSelected}
                  aria-label={`${c.label}${isSelected ? " (selected)" : ""}`}
                  data-bordered={c.swatchBorder ? "" : undefined}
                  onClick={() => setSelectedId(c.id)}
                  style={{ ["--swatch" as string]: c.swatch }}
                />
              );
            })}
          </div>

          <div className={styles.buys}>
            <div
              className={styles.sizes}
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
                    className={styles.size}
                    aria-pressed={isSelected}
                    aria-label={`Size ${size}${isSelected ? " (selected)" : ""}`}
                    onClick={() => {
                      // Toggle: same size clears the selection; another moves it.
                      setSelectedSize((prev) => (prev === size ? null : size));
                      setNeedsSize(false);
                    }}
                  >
                    <span className={styles.sizeLabel}>{size}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className={styles.add}
              onClick={handleAdd}
              aria-label={
                selectedSize
                  ? `Add ${product.title} (${selected.label}, size ${selectedSize}) to cart`
                  : `Add ${product.title} to cart — select a size first`
              }
            >
              + ADD
            </button>
          </div>
        </div>
        )}

        {/* Right-aligned prompt shown only after a size-less + ADD attempt (full
            variant only). Absolutely positioned → reserves no flow space, so it
            can never shift the grid. visibility:hidden (default) keeps it out of
            the a11y tree until shown, when role="alert" announces it. */}
        {!summary && (
          <p
            className={styles.sizeHint}
            role="alert"
            data-show={needsSize ? "" : undefined}
          >
            SELECT A SIZE
          </p>
        )}
      </div>
    </article>
  );
}
