"use client";

import { usePortalHold } from "./PortalNav";

/**
 * Route `<main>` wrapper that holds its entrance animation while a FORWARD portal
 * transition is covering the viewport, releasing it at `revealing` (via the
 * global `.portalHold` class → paused CSS entrance animations + hidden). Lets the
 * server route pages stay server components. No transition / reduced motion /
 * mobile → never holds, so content animates exactly as before.
 */
export default function PortalMain({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const hold = usePortalHold();
  return (
    <main className={`${className ?? ""}${hold ? " portalHold" : ""}`}>
      {children}
    </main>
  );
}
