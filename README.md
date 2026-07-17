# 2HOT2HANDLE — 2H2H

Desktop homepage for the 2HOT2HANDLE (2H2H) music & studio project.

Built with **Next.js (App Router, TypeScript, src/)**, plain **CSS Modules**, and
**Three.js** for the central 3D monogram. No Tailwind, no animation libraries.

## Overview

Single-viewport (`100dvh`, no scroll) dark homepage matching the Figma reference
frame of 1728 × 976. Four interface blocks are independently anchored to the real
viewport corners with 64px spacing. The central 2H2H monogram is the **exact Figma
SVG turned into real extruded WebGL geometry** (SVGLoader → `ExtrudeGeometry`),
front-facing at rest and driven by wheel / trackpad input around the Y axis with
inertial damping. The page itself never scrolls.

## Assets (all stored locally — no hotlinking)

- `public/assets/svg/monogram.svg` — exact central vector, extruded in 3D
- `public/assets/svg/logo.svg` — 2HOT2HANDLE wordmark (274 × 24)
- `public/assets/images/release-cover.png` — 2H2H001 cover art (220 × 220)
- `public/fonts/ClashDisplay-Regular.woff2` / `.woff` — Clash Display Regular
  (Fontshare, ITF Free Font License), wired via `next/font/local`

## Key source files

- `src/app/layout.tsx` — root layout, font, metadata
- `src/app/globals.css` — reset, gradient background, no-scroll viewport, typography
- `src/app/page.tsx` + `page.module.css` — corner blocks, exact anchoring
- `src/components/Monogram.tsx` + `.module.css` — Three.js scene, wheel interaction, SVG fallback

## Getting started

```bash
npm install      # if dependencies are not yet installed
npm run dev      # http://localhost:3000
```

Production:

```bash
npm run build
npm run start
```

> Best viewed on a desktop viewport (reference: 1728 × 976). This build is
> intentionally desktop-only.
