/** @type {import('next').NextConfig} */
// Vercel deployment config for the RealmSwap marketing site.
//
// This site targets Vercel's managed Next.js runtime (NOT a static export), so
// route handlers and server actions under app/ run at request time. The site is
// served at the domain root, so there is intentionally no basePath/assetPrefix
// here (those were GitHub-Pages `/RealmSwap` subpath concessions and have been
// removed). Root-absolute assets like `/logo.png` resolve straight from public/.
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
