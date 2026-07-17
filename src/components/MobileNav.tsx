"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./MobileNav.module.css";

/**
 * Mobile header (logo -> Home + burger) and full-viewport menu overlay.
 * The logo replaces the HOME entry, so the menu lists RELEASES / ABOUT /
 * A DAY WITH only. Includes focus trap, Escape/route/close handling, body lock
 * and focus restore to the burger. Rendered on every route; CSS hides it on
 * desktop (>=768px).
 */
const MENU_ITEMS = [
  { label: "RELEASES", href: "/releases" },
  { label: "A DAY WITH", href: "/a-day-with" },
  { label: "ABOUT", href: "/about" },
] as const;

const SOUNDCLOUD_PATH =
  "M3.46875 4.34375C3.46875 4.28125 3.40625 4.21875 3.34375 4.21875C3.25 4.21875 3.1875 4.28125 3.1875 4.34375L3.03125 6.375L3.1875 8.5C3.1875 8.59375 3.25 8.625 3.34375 8.625C3.40625 8.625 3.46875 8.59375 3.46875 8.5L3.65625 6.375L3.46875 4.34375ZM4.125 2.90625C4.21875 2.90625 4.28125 2.96875 4.28125 3.0625L4.46875 6.375L4.28125 8.5C4.28125 8.59375 4.21875 8.65625 4.125 8.65625C4.0625 8.65625 4 8.59375 3.96875 8.5L3.8125 6.375L3.96875 3.0625C4 2.96875 4.0625 2.90625 4.125 2.90625ZM4.9375 2.15625C5.03125 2.15625 5.09375 2.21875 5.09375 2.3125L5.25 6.375L5.09375 8.5C5.09375 8.59375 5.03125 8.65625 4.9375 8.65625C4.84375 8.65625 4.78125 8.59375 4.75 8.5L4.625 6.375L4.75 2.3125C4.78125 2.21875 4.84375 2.15625 4.9375 2.15625ZM0.21875 5.1875C0.25 5.1875 0.28125 5.21875 0.28125 5.25L0.46875 6.375L0.28125 7.46875C0.28125 7.5 0.25 7.53125 0.21875 7.53125C0.15625 7.53125 0.15625 7.5 0.125 7.46875L0 6.375L0.125 5.25C0.15625 5.21875 0.15625 5.1875 0.21875 5.1875ZM0.9375 4.5C1 4.5 1.03125 4.53125 1.03125 4.5625L1.25 6.375L1.03125 8.125C1.03125 8.1875 1 8.21875 0.9375 8.21875C0.90625 8.21875 0.875 8.1875 0.875 8.125L0.65625 6.375L0.875 4.5625C0.875 4.53125 0.90625 4.5 0.9375 4.5ZM1.75 4.125C1.78125 4.125 1.84375 4.1875 1.84375 4.25L2.0625 6.375L1.84375 8.4375C1.84375 8.46875 1.78125 8.53125 1.75 8.53125C1.6875 8.53125 1.65625 8.46875 1.625 8.4375L1.46875 6.375L1.625 4.25C1.65625 4.1875 1.6875 4.125 1.75 4.125ZM2.53125 4.0625C2.59375 4.0625 2.65625 4.125 2.65625 4.1875L2.84375 6.375L2.65625 8.5C2.65625 8.5625 2.59375 8.59375 2.53125 8.59375C2.46875 8.59375 2.40625 8.5625 2.40625 8.5L2.25 6.375L2.40625 4.1875C2.40625 4.125 2.46875 4.0625 2.53125 4.0625ZM10.0625 0.59375C10.1562 0.65625 10.1875 0.71875 10.2188 0.8125L10.3438 6.375L10.2188 8.375C10.2188 8.53125 10.0938 8.65625 9.9375 8.65625C9.8125 8.65625 9.6875 8.53125 9.65625 8.375L9.625 7.375L9.5625 6.375L9.65625 0.84375V0.8125C9.65625 0.75 9.71875 0.65625 9.78125 0.625C9.8125 0.59375 9.875 0.5625 9.9375 0.5625C10 0.5625 10.0312 0.5625 10.0625 0.59375ZM9.25 1.09375C9.3125 1.125 9.34375 1.1875 9.375 1.28125L9.46875 6.375L9.375 8.21875L9.34375 8.40625C9.34375 8.5 9.34375 8.5625 9.28125 8.59375C9.25 8.625 9.1875 8.65625 9.09375 8.65625C9.03125 8.65625 8.96875 8.625 8.90625 8.5625C8.875 8.53125 8.84375 8.46875 8.84375 8.4375V8.40625C8.75 6.375 8.75 6.375 8.75 6.375L8.84375 1.34375V1.28125C8.84375 1.1875 8.90625 1.125 8.96875 1.09375C9 1.0625 9.0625 1.03125 9.09375 1.03125C9.15625 1.03125 9.1875 1.0625 9.25 1.09375ZM5.75 1.78125C5.875 1.78125 5.9375 1.875 5.9375 1.96875L6.09375 6.375L5.9375 8.46875C5.9375 8.5625 5.875 8.65625 5.75 8.65625C5.65625 8.65625 5.59375 8.5625 5.5625 8.46875L5.4375 6.375L5.5625 1.96875C5.5625 1.875 5.65625 1.78125 5.75 1.78125ZM17.5312 3.75C18.875 3.75 20 4.84375 19.9688 6.21875C19.9688 7.5625 18.875 8.65625 17.5312 8.65625H10.7188C10.5625 8.625 10.4375 8.53125 10.4375 8.375V0.5625C10.4375 0.40625 10.5 0.34375 10.6875 0.28125C11.1562 0.09375 11.6875 0 12.25 0C14.5312 0 16.375 1.71875 16.5625 3.9375C16.875 3.8125 17.1875 3.75 17.5312 3.75ZM8.25 1.875C8.375 1.875 8.46875 1.96875 8.5 2.09375L8.625 6.375L8.5 8.4375C8.5 8.5625 8.375 8.65625 8.25 8.65625C8.125 8.65625 8.03125 8.5625 8 8.4375L7.90625 6.375L8 2.09375C8.03125 1.96875 8.125 1.875 8.25 1.875ZM6.59375 1.625C6.6875 1.625 6.78125 1.71875 6.78125 1.8125L6.9375 6.375L6.78125 8.46875C6.78125 8.5625 6.6875 8.65625 6.59375 8.65625C6.46875 8.65625 6.40625 8.5625 6.375 8.46875L6.25 6.375L6.375 1.8125C6.375 1.71875 6.46875 1.625 6.59375 1.625ZM7.40625 1.71875C7.53125 1.71875 7.625 1.8125 7.625 1.9375L7.75 6.375L7.625 8.4375C7.625 8.5625 7.53125 8.65625 7.40625 8.65625C7.3125 8.65625 7.21875 8.5625 7.1875 8.4375L7.09375 6.375L7.1875 1.9375C7.1875 1.8125 7.28125 1.71875 7.40625 1.71875Z";

export default function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Close automatically whenever the route changes (covers browser back/fwd).
  const prevPath = useRef(pathname);
  useEffect(() => {
    if (prevPath.current !== pathname) {
      prevPath.current = pathname;
      setOpen(false);
    }
  }, [pathname]);

  // Body lock + Escape + focus trap while open; restore focus on close.
  useEffect(() => {
    if (!open) return;
    const burger = burgerRef.current;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = overlayRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    // move focus into the overlay
    const firstLink = overlayRef.current?.querySelector<HTMLElement>("a[href]");
    firstLink?.focus();

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      burger?.focus();
    };
  }, [open]);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <Link className={styles.logoLink} href="/" aria-label="2HOT2HANDLE — Home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.logo}
            src="/assets/svg/logo.svg"
            alt="2HOT2HANDLE"
            width={183}
            height={16}
          />
        </Link>

        <button
          ref={burgerRef}
          type="button"
          className={styles.iconBtn}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((v) => !v)}
        >
          <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
            {open ? (
              <path
                d="M9 9 L23 23 M23 9 L9 23"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M6 11 H26 M6 21 H26"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            )}
          </svg>
        </button>
      </header>

      {open && (
        <div
          id="mobile-menu"
          ref={overlayRef}
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <nav className={styles.menuNav} aria-label="Primary">
            {MENU_ITEMS.map((item) => {
              const active = item.href === pathname;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={active ? styles.menuActive : undefined}
                  onClick={close}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <ul className={styles.social} aria-label="Social">
            <li>
              <a
                href="https://soundcloud.com/2h2h_music"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="2H2H on SoundCloud"
              >
                <svg className={styles.scIcon} viewBox="0 -3.5 20 16" aria-hidden="true">
                  <path d={SOUNDCLOUD_PATH} fill="currentColor" />
                </svg>
              </a>
            </li>
            <li>
              <a
                href="https://www.instagram.com/2h2h_records"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="2H2H on Instagram"
              >
                <svg className={styles.icon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="2.5" y="2.5" width="19" height="19" rx="5" stroke="currentColor" strokeWidth="1.8" />
                  <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.8" />
                  <circle cx="17.5" cy="6.5" r="1.3" fill="currentColor" />
                </svg>
              </a>
            </li>
            <li>
              <a
                href="https://www.youtube.com/@2H2HMusic"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="2H2H on YouTube"
              >
                <svg className={styles.icon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="1.5" y="5" width="21" height="14" rx="4" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M10 8.75 L16 12 L10 15.25 Z" fill="currentColor" />
                </svg>
              </a>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
