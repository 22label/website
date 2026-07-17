import AboutText from "@/components/AboutText";
import styles from "./about.module.css";

const ABOUT_TEXT = `Some energies never die — they distort, collapse, and regenerate.
After silence and dust, something awakens again.

No trends. No filters.
No nostalgia — only the now.

The energy reincarnates and it is 2HOT2HANDLE — the new chapter born from the ashes of B.SOUL.
Still uncompromising, but sharper, bolder, and burning hotter.

Raw house. Heavy groove. No compromise.

The heat never left — it just changed shape.`;

export default function AboutPage() {
  return (
    <main className={styles.content}>
      <h1 className={styles.title}>ABOUT</h1>
      <AboutText text={ABOUT_TEXT} />
    </main>
  );
}
