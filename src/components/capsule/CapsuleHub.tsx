"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import type { CapsuleProduct } from "@/data/capsule";
import { MENS_TEES, MENS_CATEGORY_TABS } from "@/data/capsule";
import { addToCartLines, cartCount } from "@/data/capsuleCart.mjs";
import ProductCard from "./ProductCard";
import styles from "./capsule.module.css";

/**
 * CAPSULE 22 — MENS hub (desktop). A self-contained, music-free environment that
 * renders OUTSIDE the shared shell (see Shell.tsx). Holds the cart-quantity
 * boundary and the collection; audio is paused/locked at the AudioProvider level
 * for this route, so nothing here touches the audio engine.
 */

interface CartLine {
  productId: string;
  colorId: string;
  qty: number;
}

export default function CapsuleHub() {
  // Minimal, honest cart-state boundary: a quantity ledger keyed by variant. There
  // is no cart drawer / checkout designed yet, so this only tracks the total count
  // surfaced in CART (n). Swap the store later without touching the cards.
  const [lines, setLines] = useState<CartLine[]>([]);
  const count = cartCount(lines);

  const addToCart = useCallback((product: CapsuleProduct, colorId: string) => {
    setLines((prev) => addToCartLines(prev, product.id, colorId));
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <Link className={styles.logoLink} href="/" aria-label="2HOT2HANDLE — Home">
          <span className={styles.logo} role="img" aria-label="2HOT2HANDLE" />
          <span className={styles.est}>EST. 2026 / BCN [ES]</span>
        </Link>

        <div className={styles.titleBlock}>
          <p className={styles.collectionTitle}>CAPSULE - 22 ORIGINS</p>
          <nav className={styles.gender} aria-label="Gender">
            <span className={styles.genderActive} aria-current="page">
              MENS
            </span>
            <span
              className={styles.genderInactive}
              aria-disabled="true"
              title="Coming soon"
            >
              WOMENS
            </span>
          </nav>
        </div>

        <div className={styles.cart}>
          <span aria-live="polite">CART ({count})</span>
        </div>
      </header>

      <main className={styles.collection} tabIndex={-1}>
        <div className={styles.row}>
          {MENS_TEES.map((product) => (
            <ProductCard key={product.id} product={product} onAdd={addToCart} />
          ))}
        </div>
      </main>

      <nav className={styles.categoryBar} aria-label="Product categories">
        {MENS_CATEGORY_TABS.map((tab) => (
          <div key={tab.id} className={styles.categoryItem}>
            {tab.comingSoon ? (
              <>
                <span className={styles.categoryInactive} aria-disabled="true">
                  {tab.label}
                </span>
                <span className={styles.comingSoon}>COMING SOON</span>
              </>
            ) : (
              <span className={styles.categoryActive} aria-current="page">
                {tab.label}
              </span>
            )}
          </div>
        ))}
      </nav>
    </div>
  );
}
