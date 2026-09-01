import AboutText from "@/components/AboutText";
import PortalMain from "@/components/PortalMain";
import KineticTitle from "@/components/KineticTitle";
import styles from "./about.module.css";

// Final About copy. Rendered by AboutText with `white-space: pre-wrap`, so single
// "\n" are editorial line breaks (the "driven by…"/"Through sound…" split and the
// "Nothing made to follow."/"Nothing made to fit in." split) and blank lines
// separate paragraphs; everything else wraps naturally.
const ABOUT_TEXT = `Some energies never die — they move, transform, and find their way back in new forms.

No trends. No filters. No nostalgia — only the now.

2HOT2HANDLE is driven by something you can’t always see, but you can feel.
Through sound, movement and form, the same frequency takes different shapes.

Raw house. Heavy groove. Limited capsules.

Nothing made to follow.
Nothing made to fit in.

Guided by frequency.`;

export default function AboutPage() {
  return (
    <PortalMain className={styles.content}>
      <KineticTitle className={styles.title}>ABOUT</KineticTitle>
      <AboutText text={ABOUT_TEXT} />
    </PortalMain>
  );
}
