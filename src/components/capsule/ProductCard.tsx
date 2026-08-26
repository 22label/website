"use client";

import { useState } from "react";
import type { CapsuleProduct } from "@/data/capsule";
import { formatPrice } from "@/data/capsule";
import styles from "./capsule.module.css";

/**
 * One product in the CAPSULE collection. Colour selectors are real buttons that
 * crossfade the front image; on hover-capable devices the image crossfades to the
 * matching back (the pairing always follows the selected colour). Touch cannot get
 * stuck in the hover state — the hover reveal is gated to mouse pointers. All
 * colour layers are rendered as stacked <img> so every variant is preloaded and
 * the opacity crossfade never flashes.
 */
export default function ProductCard({
  product,
  onAdd,
}: {
  product: CapsuleProduct;
  onAdd: (product: CapsuleProduct, colorId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(
    product.defaultColorId ?? product.colors[0].id,
  );
  const [hovered, setHovered] = useState(false);

  const selected =
    product.colors.find((c) => c.id === selectedId) ?? product.colors[0];
  const showBack = hovered && !!selected.back;

  return (
    <article className={styles.card}>
      <div
        className={styles.imageWrap}
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
      </div>

      <div className={styles.info}>
        <div className={styles.infoRow}>
          <span className={styles.productTitle}>{product.title}</span>
          <span className={styles.price}>{formatPrice(product.price)}</span>
        </div>

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

          <button
            type="button"
            className={styles.add}
            onClick={() => onAdd(product, selectedId)}
            aria-label={`Add ${product.title} (${selected.label}) to cart`}
          >
            + ADD
          </button>
        </div>
      </div>
    </article>
  );
}
