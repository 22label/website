import { test } from "node:test";
import assert from "node:assert/strict";
import { addToCartLines, cartCount } from "../src/data/capsuleCart.mjs";

test("empty ledger → count 0", () => {
  assert.equal(cartCount([]), 0);
});

test("adding a variant creates a line with qty 1 → CART (1)", () => {
  const l = addToCartLines([], "signal-tee", "black");
  assert.deepEqual(l, [{ productId: "signal-tee", colorId: "black", qty: 1 }]);
  assert.equal(cartCount(l), 1);
});

test("adding the SAME variant twice increments one line → CART (2)", () => {
  let l = addToCartLines([], "22-tee", "cream");
  l = addToCartLines(l, "22-tee", "cream");
  assert.equal(l.length, 1);
  assert.equal(l[0].qty, 2);
  assert.equal(cartCount(l), 2);
});

test("different colours of the same product are distinct lines", () => {
  let l = addToCartLines([], "signal-tee", "black");
  l = addToCartLines(l, "signal-tee", "cream");
  assert.equal(l.length, 2);
  assert.equal(cartCount(l), 2);
});

test("count sums quantities across products → CART (n)", () => {
  let l = addToCartLines([], "signal-tee", "black");
  l = addToCartLines(l, "signal-tee", "black");
  l = addToCartLines(l, "guided-tee", "white");
  assert.equal(cartCount(l), 3);
});

test("addToCartLines is immutable (does not mutate the input)", () => {
  const before = [{ productId: "22-tee", colorId: "cream", qty: 1 }];
  const snapshot = JSON.parse(JSON.stringify(before));
  const after = addToCartLines(before, "22-tee", "cream");
  assert.deepEqual(before, snapshot); // input untouched
  assert.notEqual(after, before); // new array
  assert.equal(after[0].qty, 2);
});
