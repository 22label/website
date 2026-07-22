import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Shell from "@/components/Shell";
import AudioProvider from "@/components/AudioProvider";
import PortalNav from "@/components/PortalNav";
import LandscapeBlocker from "@/components/LandscapeBlocker";

/**
 * Clash Display (Fontshare, ITF Free Font License) — self-hosted under
 * /public/fonts. Regular 400, Semibold 600, Bold 700 all share one family so
 * the WebGL marquee can read the generated name from --font-clash-display.
 */
const clashDisplay = localFont({
  src: [
    {
      path: "../../public/fonts/ClashDisplay-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/ClashDisplay-Regular.woff",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/ClashDisplay-Semibold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../public/fonts/ClashDisplay-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-clash-display",
  display: "swap",
  fallback: ["Helvetica Neue", "Arial", "sans-serif"],
});

export const metadata: Metadata = {
  title: "2HOT2HANDLE — Music & Studio",
  description:
    "2HOT2HANDLE (2H2H) — an independent music and studio project based in Barcelona, Spain. Guided by frequency.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={clashDisplay.variable}>
      <body>
        {/* One persistent audio element for the whole app (survives client-side
            navigation), shared by the desktop rail + Home-mobile players. */}
        <AudioProvider>
          {/* PortalNav owns the desktop route-transition timeline + navigation
              and provides the transition phase to the shell + route content. */}
          <PortalNav>
            {/* Shared shell: single no-scroll viewport + the anchored corners */}
            <Shell>{children}</Shell>
          </PortalNav>
        </AudioProvider>
        {/* Phone-landscape blocker — mounted at the root, OUTSIDE the desktop/
            mobile layout selection, so it can cover the whole site regardless of
            which layout is active. */}
        <LandscapeBlocker />
      </body>
    </html>
  );
}
