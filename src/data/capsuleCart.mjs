/**
 * Pure cart-ledger operations for the CAPSULE hub. A line is keyed by the full
 * variant tuple (product + colour + size), so repeat adds of the SAME tuple
 * increment quantity rather than duplicating. Each line carries everything needed
 * to render + price it (name, colour label, size, unit price, thumbnail), so the
 * ledger is self-contained and can be swapped for a real store / persisted later.
 *
 * Kept as a pure .mjs module so it is unit-testable (repo convention). There is no
 * checkout designed yet — this is the state boundary behind CART (n) + the drawer.
 *
 * @typedef {{
 *   productId: string, name: string,
 *   colorId: string, colorLabel: string,
 *   size: string, unitPrice: number,
 *   thumb: string, thumbAlt: string,
 *   qty: number
 * }} CartLine
 */

/** Flat shipping fee shown in the Figma drawer ("Shipping costs €6,99"). */
export const SHIPPING_EUR = 6.99;

/** Stable identity of a line: same product + colour + size ⇒ same line. */
export function lineKey(productId, colorId, size) {
  return `${productId}::${colorId}::${size}`;
}

/**
 * Add one unit of a variant, incrementing an existing line if the exact
 * product+colour+size tuple is already present. Pure (returns a new array).
 * `item` omits qty; the new line starts at qty 1.
 */
export function addLine(lines, item) {
  const key = lineKey(item.productId, item.colorId, item.size);
  const i = lines.findIndex(
    (l) => lineKey(l.productId, l.colorId, l.size) === key,
  );
  if (i === -1) return [...lines, { ...item, qty: 1 }];
  const next = lines.slice();
  next[i] = { ...next[i], qty: next[i].qty + 1 };
  return next;
}

/** Remove a whole line by its key. Pure. (Model-level; no UI control in Figma.) */
export function removeLine(lines, key) {
  return lines.filter((l) => lineKey(l.productId, l.colorId, l.size) !== key);
}

/**
 * Set the quantity of a line by key. qty is normalised first, so a line can never
 * hold an invalid quantity. Removal is NOT done here — it happens only via the X
 * (removeLine); a 0/blank/invalid entry normalises to 1 (per the Figma quantity
 * field spec). Pure.
 */
export function setQty(lines, key, qty) {
  const q = normalizeQty(qty);
  return lines.map((l) =>
    lineKey(l.productId, l.colorId, l.size) === key ? { ...l, qty: q } : l,
  );
}

/**
 * Coerce any user entry to a valid line quantity: a whole integer ≥ 1. Empty,
 * blank, 0, negative, decimal, NaN and arbitrary text all collapse to a safe
 * value (decimals floor, everything else invalid → 1). Never returns 0 — removal
 * is the X's job, not the quantity field's.
 */
export function normalizeQty(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

/** Total quantity across all lines (the number shown in CART (n)). */
export function cartCount(lines) {
  return lines.reduce((n, l) => n + l.qty, 0);
}

/** Sum of unitPrice × qty across all lines. */
export function cartSubtotal(lines) {
  return lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
}

/** Grand total: subtotal + shipping. Empty cart totals 0 (no shipping charged). */
export function cartTotal(lines) {
  return lines.length ? cartSubtotal(lines) + SHIPPING_EUR : 0;
}
