/**
 * Pure cart-ledger operations for the CAPSULE hub. The ledger is a list of lines
 * keyed by product + colour variant, so repeat adds increment quantity rather than
 * duplicating. There is no drawer/checkout designed yet — this is only the state
 * boundary behind the CART (n) count. Kept as a pure .mjs module so it is unit-
 * testable (repo convention) and can be swapped for a real store later.
 *
 * @typedef {{ productId: string, colorId: string, qty: number }} CartLine
 */

/** Add one unit of a variant, incrementing an existing line if present. Pure. */
export function addToCartLines(lines, productId, colorId) {
  const i = lines.findIndex(
    (l) => l.productId === productId && l.colorId === colorId,
  );
  if (i === -1) return [...lines, { productId, colorId, qty: 1 }];
  const next = lines.slice();
  next[i] = { ...next[i], qty: next[i].qty + 1 };
  return next;
}

/** Total quantity across all lines (the number shown in CART (n)). */
export function cartCount(lines) {
  return lines.reduce((n, l) => n + l.qty, 0);
}
