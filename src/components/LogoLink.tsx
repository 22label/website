"use client";

import Link from "next/link";
import { useNavClick } from "./PortalNav";

/**
 * The top-left logo Home link, with the portal transition interception (desktop).
 * Same markup/classes as before; modified/middle clicks keep native behaviour.
 */
export default function LogoLink({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const onNavClick = useNavClick();
  return (
    <Link
      className={className}
      href="/"
      aria-label="2HOT2HANDLE — Home"
      onClick={onNavClick("/")}
    >
      {children}
    </Link>
  );
}
