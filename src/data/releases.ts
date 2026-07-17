/**
 * Data-driven releases. Add entries here and they render horizontally to the
 * right in the Releases rail — no component changes needed.
 */
export interface Release {
  id: string;
  catalog: string;
  lines: string[]; // artist / title / extra — all white
  cover: string;
  coverAlt: string;
  /** Only SoundCloud is live for now; the rest stay disabled. */
  soundcloud?: string;
}

export const releases: Release[] = [
  {
    id: "2h2h001",
    catalog: "2H2H001",
    lines: ["MARCOS BAIANO", "BACK TO THE FUTURE EP", "+TERENCE :TERRY: REMIX"],
    cover: "/assets/images/release-cover.png",
    coverAlt:
      "2H2H001 — Marcos Baiano, Back to the Future EP (+ Terence :Terry: remix) cover artwork",
    soundcloud: "https://soundcloud.com/2h2h_music",
  },
];

/** Platform buttons under each cover — fixed order; only SoundCloud is active. */
export const PLATFORMS = [
  { key: "soundcloud", label: "SoundCloud", icon: "/assets/icons/soundcloud.svg" },
  { key: "beatport", label: "Beatport", icon: "/assets/icons/beatport.svg" },
  { key: "traxsource", label: "Traxsource", icon: "/assets/icons/traxsource.svg" },
  { key: "spotify", label: "Spotify", icon: "/assets/icons/spotify.svg" },
  { key: "apple", label: "Apple Music", icon: "/assets/icons/apple.svg" },
] as const;
