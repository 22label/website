import AboutText from "@/components/AboutText";
import PortalMain from "@/components/PortalMain";
import KineticTitle from "@/components/KineticTitle";
import styles from "./about.module.css";

// Exact copy + paragraph structure from Figma (node 204:7158 / 204:8707).
// Rendered by AboutText with `white-space: pre-wrap`, so single "\n" are the
// editorial line breaks (the "No trends"/"No nostalgia" split and the final two
// lines) and blank lines separate paragraphs; everything else wraps naturally.
const ABOUT_TEXT = `Some energies never die — they distort, collapse, and regenerate. After silence and dust, something awakens again.

No trends. No filters.
No nostalgia — only the now.

The energy reincarnates and it is 2HOT2HANDLE — the new chapter born from the ashes of B.SOUL Music. Still uncompromising, but sharper, bolder, and burning hotter. Raw house. Heavy groove. No compromise.

The heat never left,
it just changed shape.`;

export default function AboutPage() {
  return (
    <PortalMain className={styles.content}>
      <KineticTitle className={styles.title}>ABOUT</KineticTitle>
      <AboutText text={ABOUT_TEXT} />
    </PortalMain>
  );
}
