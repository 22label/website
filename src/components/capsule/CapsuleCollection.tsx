"use client";

import { useEffect } from "react";
import type { CapsuleGender } from "@/data/capsule";
import { CAPSULE_CATALOG, ALL_CAPSULE_IMAGES } from "@/data/capsule";
import { useCapsuleCart } from "./CapsuleCartContext";
import CapsuleHeader from "./CapsuleHeader";
import ProductCard from "./ProductCard";
import HubCursor from "./HubCursor";
import StickyMenu from "./StickyMenu";
import styles from "./capsule.module.css";

/**
 * CAPSULE collection grid for one audience (Figma 263-525 desktop, 285-791 /
 * 285-1752 mobile). The audience comes from the route (/capsule/mens|womens), not
 * internal state, so it is refresh-safe and unambiguous. Cards are SUMMARY
 * (image + centred title). Desktop shows the header menu + text cursor over images;
 * mobile shows the sticky bottom menu (audience + category) and reserves matching
 * bottom space so it never covers the last card. Music-free; cart is shared.
 */
export default function CapsuleCollection({ gender }: { gender: CapsuleGender }) {
  const { drawerOpen } = useCapsuleCart();
  const category = "tee" as const;
  const { tabs } = CAPSULE_CATALOG[gender];
  const products = CAPSULE_CATALOG[gender].products.filter(
    (p) => p.category === category,
  );

  useEffect(() => {
    for (const src of ALL_CAPSULE_IMAGES) {
      const img = new Image();
      img.src = src;
    }
  }, []);

  return (
    <div
      className={styles.page}
      data-drawer-open={drawerOpen ? "" : undefined}
      data-has-sticky=""
    >
      <CapsuleHeader menu={{ activeGender: gender, activeCategory: category, tabs }} />

      <main className={styles.collection} tabIndex={-1}>
        <div key={gender} className={styles.row}>
          {products.map((product) => (
            <ProductCard key={product.id} product={product} variant="summary" />
          ))}
        </div>
      </main>

      <StickyMenu activeGender={gender} activeCategory={category} tabs={tabs} />
      <HubCursor disabled={drawerOpen} />
    </div>
  );
}
