import Monogram from "@/components/Monogram";
import HomeMobileBottom from "@/components/HomeMobileBottom";

export default function Home() {
  // The shared Shell (layout) renders the corners / mobile header and the
  // desktop rail (info + player). The Home centre is the WebGL marquee + 3D
  // glass monogram (only mounts on this route). The mobile bottom section
  // (player + animated info) is Home-mobile only.
  return (
    <>
      <Monogram />

      {/* Mobile-only Home bottom section: player + animated info (Home only) */}
      <HomeMobileBottom />
    </>
  );
}
