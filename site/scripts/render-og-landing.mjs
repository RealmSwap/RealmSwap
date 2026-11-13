// Renders the landing page's social card (public/og-landing.png). Run by hand
// when the card changes:
//
//   node scripts/render-og-landing.mjs
//
// The output is committed, so nothing at build or deploy time needs an image
// stack (sharp is only a devDependency for this one generation step). The
// dynamic per-realm / per-server cards are rendered at request time by
// next/og (see app/*/opengraph-image.tsx) — which cannot load on Windows, so
// they fall back to this same file there.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const W = 1200;
const H = 630;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow" cx="50%" cy="-10%" r="80%">
      <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="44" height="44" patternUnits="userSpaceOnUse">
      <path d="M 44 0 L 0 0 0 44" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="#08090c"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.08)" rx="28"/>

  <text x="72" y="150" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="26" font-weight="700" letter-spacing="6" fill="#8b5cf6">FREE · LOCAL · BOOT-TESTED</text>
  <text x="72" y="262" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="72" font-weight="800" fill="#ffffff">A modded server for your</text>
  <text x="72" y="352" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="72" font-weight="800" fill="#ffffff">friends, running tonight.</text>
  <text x="72" y="428" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="30" fill="#94a3b8">Pick a game, click deploy, share one invite.</text>
  <text x="72" y="470" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="30" fill="#94a3b8">No rent, no queues — it runs on your own PC.</text>

  <g transform="translate(72, 522)">
    <rect width="56" height="56" rx="14" fill="#8b5cf6"/>
    <text x="28" y="39" font-size="32" text-anchor="middle">🎮</text>
    <text x="76" y="26" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="28" font-weight="700" fill="#ffffff">RealmSwap</text>
    <text x="76" y="52" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="21" fill="#94a3b8">realmswap.app</text>
    <text x="${W - 72 - 200}" y="40" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="24" fill="#94a3b8">Windows · free</text>
  </g>
</svg>
`;

const out = path.join(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "public", "og-landing.png");
sharp(Buffer.from(svg))
  .png()
  .toFile(out)
  .then((info) => console.log(`[render-og-landing] wrote ${out} (${info.width}x${info.height}, ${Math.round(info.size / 1024)} KB)`))
  .catch((err) => {
    console.error("[render-og-landing] failed:", err.message);
    process.exit(1);
  });
