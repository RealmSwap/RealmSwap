import fs from "node:fs";
import path from "node:path";
import type React from "react";
import { OG_SIZE } from "./og";

/**
 * Renders an OG image route's card, or falls back to the committed landing
 * card. next/og's bundled-font loader is POSIX-only (`path.join` mangles a
 * file: URL on Windows), and its module-init failure fires asynchronously —
 * it would corrupt any in-flight response even inside a try/catch. So on
 * Windows the import is never attempted: the route serves the static card,
 * which is what a local `next start` can verify. The Linux deployment
 * (Vercel) renders the real per-realm / per-server card.
 */
export async function renderOgCard(element: React.ReactElement): Promise<Response> {
  if (process.platform !== "win32") {
    try {
      const { ImageResponse } = await import("next/og");
      return new ImageResponse(element, { ...OG_SIZE });
    } catch {
      // fall through to the static card
    }
  }
  const png = fs.readFileSync(path.join(process.cwd(), "public", "og-landing.png"));
  return new Response(new Uint8Array(png), {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=3600" },
  });
}
