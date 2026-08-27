"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { ReactNode, RefObject } from "react";
import { addLine, removeLine, setQty, cartCount } from "@/data/capsuleCart.mjs";
import type { AddToCartInput } from "./ProductCard";
import CartDrawer from "./CartDrawer";

/**
 * Shared CAPSULE cart. Lives in the /capsule route-group layout so the SAME cart
 * survives client navigation between the hub, MENS/WOMENS and every single-product
 * page — switching route or audience never clears it. Holds the line-item ledger
 * (predictable pure reducer), the drawer open/closed state (kept separate from the
 * cart contents) and one shared CartDrawer instance + CART-trigger ref for focus
 * return.
 */

type CartLine = ReturnType<typeof addLine>[number];
type CartAction =
  | { type: "add"; item: AddToCartInput }
  | { type: "remove"; key: string }
  | { type: "setQty"; key: string; qty: number };

function cartReducer(lines: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case "add":
      return addLine(lines, action.item);
    case "remove":
      return removeLine(lines, action.key);
    case "setQty":
      return setQty(lines, action.key, action.qty);
    default:
      return lines;
  }
}

interface CapsuleCartValue {
  lines: CartLine[];
  count: number;
  add: (item: AddToCartInput) => void;
  remove: (key: string) => void;
  setQty: (key: string, qty: number) => void;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  cartButtonRef: RefObject<HTMLButtonElement | null>;
}

const CapsuleCartCtx = createContext<CapsuleCartValue | null>(null);

export function useCapsuleCart(): CapsuleCartValue {
  const ctx = useContext(CapsuleCartCtx);
  if (!ctx) throw new Error("useCapsuleCart must be used within CapsuleCartProvider");
  return ctx;
}

export default function CapsuleCartProvider({ children }: { children: ReactNode }) {
  const [lines, dispatch] = useReducer(cartReducer, []);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const cartButtonRef = useRef<HTMLButtonElement>(null);

  const add = useCallback((item: AddToCartInput) => dispatch({ type: "add", item }), []);
  const remove = useCallback((key: string) => dispatch({ type: "remove", key }), []);
  const setQtyCb = useCallback(
    (key: string, qty: number) => dispatch({ type: "setQty", key, qty }),
    [],
  );
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setDrawerOpen((o) => !o), []);

  const value = useMemo<CapsuleCartValue>(
    () => ({
      lines,
      count: cartCount(lines),
      add,
      remove,
      setQty: setQtyCb,
      drawerOpen,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      cartButtonRef,
    }),
    [lines, drawerOpen, add, remove, setQtyCb, openDrawer, closeDrawer, toggleDrawer],
  );

  return (
    <CapsuleCartCtx.Provider value={value}>
      {children}
      <CartDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        lines={lines}
        triggerRef={cartButtonRef}
        onRemove={remove}
        onQty={setQtyCb}
      />
    </CapsuleCartCtx.Provider>
  );
}
