"use client";

import { useId, useState } from "react";
import styles from "./capsule.module.css";

/**
 * Accordion for the product page DESCRIPTION / COMPOSITION blocks (Figma 285-1503
 * open / 285-1541 closed). The header is a real <button> with aria-expanded +
 * aria-controls; the panel has a stable id. Shows "−" before the title when open,
 * "+" when closed. Height animates gently via the grid-template-rows 0fr→1fr
 * technique (no hardcoded height, no display:none, content stays selectable);
 * prefers-reduced-motion makes the toggle immediate (CSS). Independent instances —
 * opening one never closes the other.
 */
export default function Accordion({
  title,
  items,
  defaultOpen = false,
}: {
  title: string;
  items: string[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div className={styles.accordion}>
      <button
        type="button"
        className={styles.accHeader}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={styles.accSymbol} aria-hidden="true">
          {open ? "−" : "+"}
        </span>
        <span className={styles.accTitle}>{title}</span>
      </button>
      <div className={styles.accPanel} data-open={open ? "" : undefined}>
        <div className={styles.accPanelInner}>
          <ul id={panelId} className={styles.accList} role="region" aria-label={title}>
            {items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
