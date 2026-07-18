import Monogram from "@/components/Monogram";
import MusicPlayer from "@/components/MusicPlayer";
import styles from "./home.module.css";

export default function Home() {
  // The shared Shell (layout) renders the corners / mobile header. The Home
  // centre is the WebGL marquee + 3D glass monogram (only mounts on this route).
  return (
    <>
      <Monogram />

      {/* Desktop-only Home music player (not mounted on mobile) */}
      <MusicPlayer />

      {/* Mobile-only bottom information (not shown on the other mobile pages) */}
      <section className={styles.mobileInfo} aria-label="Studio information">
        <div className={styles.group}>
          <span className={styles.divider} aria-hidden="true" />
          <div className={styles.copy}>
            <span className={styles.label}>BASE</span>
            <span className={styles.value}>BARCELONA [ES]</span>
          </div>
        </div>
        <div className={`${styles.group} ${styles.groupEnd}`}>
          <span className={styles.divider} aria-hidden="true" />
          <div className={`${styles.copy} ${styles.copyEnd}`}>
            <span className={styles.label}>EST.</span>
            <span className={styles.value}>2026</span>
          </div>
        </div>
      </section>
    </>
  );
}
