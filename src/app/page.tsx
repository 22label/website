import Monogram from "@/components/Monogram";

export default function Home() {
  // The shared Shell (layout) renders the corners / mobile header, the desktop
  // rail (info + player) and the global mobile bottom section. The Home centre
  // is the WebGL marquee + 3D glass monogram (only mounts on this route).
  return <Monogram />;
}
