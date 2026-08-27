import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addLine,
  removeLine,
  setQty,
  normalizeQty,
  cartCount,
  cartSubtotal,
  cartTotal,
  lineKey,
  SHIPPING_EUR,
} from "../src/data/capsuleCart.mjs";

/** Minimal line-item factory mirroring what ProductCard emits on + ADD. */
const item = (over = {}) => ({
  productId: "signal-tee",
  name: "SIGNAL TEE",
  colorId: "black",
  colorLabel: "Black",
  size: "L",
  unitPrice: 79,
  thumb: "/assets/capsule/signal-black-front.jpg",
  thumbAlt: "Signal Tee",
  ...over,
});

test("empty ledger → count 0, subtotal 0, total 0 (no shipping)", () => {
  assert.equal(cartCount([]), 0);
  assert.equal(cartSubtotal([]), 0);
  assert.equal(cartTotal([]), 0);
});

test("ADD creates a line carrying product + colour + SIZE + price + thumb", () => {
  const l = addLine([], item({ size: "M" }));
  assert.equal(l.length, 1);
  assert.equal(l[0].productId, "signal-tee");
  assert.equal(l[0].colorId, "black");
  assert.equal(l[0].size, "M");
  assert.equal(l[0].unitPrice, 79);
  assert.equal(l[0].thumb, "/assets/capsule/signal-black-front.jpg");
  assert.equal(l[0].qty, 1);
  assert.equal(cartCount(l), 1);
});

test("same product + colour + size added twice → one line, qty 2 (aggregation)", () => {
  let l = addLine([], item({ size: "L" }));
  l = addLine(l, item({ size: "L" }));
  assert.equal(l.length, 1);
  assert.equal(l[0].qty, 2);
  assert.equal(cartCount(l), 2);
});

test("same product + colour but DIFFERENT size → two distinct lines", () => {
  let l = addLine([], item({ size: "L" }));
  l = addLine(l, item({ size: "XL" }));
  assert.equal(l.length, 2);
  assert.equal(cartCount(l), 2);
});

test("same product + size but DIFFERENT colour → two distinct lines", () => {
  let l = addLine([], item({ colorId: "black", colorLabel: "Black" }));
  l = addLine(l, item({ colorId: "cream", colorLabel: "Cream" }));
  assert.equal(l.length, 2);
  assert.equal(cartCount(l), 2);
});

test("CART (n) sums quantities across products, not distinct-line count", () => {
  let l = addLine([], item({ productId: "signal-tee", size: "L" }));
  l = addLine(l, item({ productId: "signal-tee", size: "L" }));
  l = addLine(l, item({ productId: "guided-tee", name: "GUIDED TEE", size: "M" }));
  assert.equal(l.length, 2);
  assert.equal(cartCount(l), 3);
});

test("subtotal = Σ unitPrice·qty; total adds flat shipping", () => {
  let l = addLine([], item({ unitPrice: 79, size: "L" }));
  l = addLine(l, item({ unitPrice: 79, size: "L" })); // qty 2 → 158
  l = addLine(l, item({ productId: "22-tee", unitPrice: 119, size: "S" })); // +119
  assert.equal(cartSubtotal(l), 277);
  assert.equal(cartTotal(l), 277 + SHIPPING_EUR);
});

test("addLine is immutable (does not mutate the input array or line)", () => {
  const before = [{ ...item(), qty: 1 }];
  const snapshot = JSON.parse(JSON.stringify(before));
  const after = addLine(before, item());
  assert.deepEqual(before, snapshot); // input untouched
  assert.notEqual(after, before); // new array
  assert.equal(after[0].qty, 2);
});

test("removeLine drops ONLY the matching line (full identity: product+colour+size)", () => {
  // Same product name, different size AND different colour → all distinct lines.
  let l = addLine([], item({ colorId: "black", colorLabel: "Black", size: "L" }));
  l = addLine(l, item({ colorId: "black", colorLabel: "Black", size: "XL" }));
  l = addLine(l, item({ colorId: "cream", colorLabel: "Cream", size: "L" }));
  l = removeLine(l, lineKey("signal-tee", "black", "L"));
  assert.equal(l.length, 2);
  assert.ok(l.every((x) => !(x.colorId === "black" && x.size === "L")));
  assert.ok(l.some((x) => x.colorId === "black" && x.size === "XL"));
  assert.ok(l.some((x) => x.colorId === "cream" && x.size === "L"));
});

test("removing the last line yields an empty cart (count 0, total 0)", () => {
  let l = addLine([], item({ size: "L" }));
  l = removeLine(l, lineKey("signal-tee", "black", "L"));
  assert.equal(l.length, 0);
  assert.equal(cartCount(l), 0);
  assert.equal(cartTotal(l), 0);
});

test("total updates immediately after a quantity change", () => {
  const key = lineKey("signal-tee", "black", "L");
  let l = addLine([], item({ unitPrice: 79, size: "L" }));
  assert.equal(cartTotal(l), 79 + SHIPPING_EUR);
  l = setQty(l, key, 3);
  assert.equal(cartSubtotal(l), 237);
  assert.equal(cartTotal(l), 237 + SHIPPING_EUR);
  assert.equal(cartCount(l), 3);
});

test("normalizeQty coerces every bad entry to a whole integer ≥ 1", () => {
  assert.equal(normalizeQty(1), 1);
  assert.equal(normalizeQty(4), 4);
  assert.equal(normalizeQty("3"), 3);
  assert.equal(normalizeQty("2.7"), 2); // decimals floor
  assert.equal(normalizeQty(0), 1);
  assert.equal(normalizeQty(-5), 1);
  assert.equal(normalizeQty(""), 1);
  assert.equal(normalizeQty("abc"), 1);
  assert.equal(normalizeQty(NaN), 1);
  assert.equal(normalizeQty(Infinity), 1);
});

test("cart is shared across audiences — MENS + WOMENS lines coexist in one ledger", () => {
  // The ledger carries no gender: a MENS add and a WOMENS add live side by side,
  // so switching audiences in the hub can never clear or split the cart.
  let l = addLine([], item({ productId: "signal-tee", name: "SIGNAL TEE", size: "L" }));
  l = addLine(l, item({ productId: "womens-tee-1", name: "22 TEE", unitPrice: 119, size: "M" }));
  assert.equal(l.length, 2);
  assert.equal(cartCount(l), 2);
  assert.equal(cartSubtotal(l), 79 + 119);
});

test("setQty updates a line and never removes it (0 → 1)", () => {
  const key = lineKey("signal-tee", "black", "L");
  let l = addLine([], item({ size: "L" }));
  l = setQty(l, key, 5);
  assert.equal(l[0].qty, 5);
  assert.equal(cartCount(l), 5);
  // 0 / invalid must normalise to 1, NOT delete the line (removal is the X's job).
  l = setQty(l, key, 0);
  assert.equal(l.length, 1);
  assert.equal(l[0].qty, 1);
});
