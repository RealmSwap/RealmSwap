/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // The API e2e harness (scripts/e2e-api) builds and boots the app into an
  // isolated distDir so `next build` never clobbers a running dev server's
  // .next. Unset in every other context — including packaging.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // ssh2's native .node addons must load from disk at runtime, not be bundled.
  // Replaces the old webpack-externals block (Turbopack, the Next 16 default
  // bundler, ignores webpack config).
  serverExternalPackages: ["ssh2", "ssh2-sftp-client"],
  async redirects() {
    return [
      {
        source: '/',
        destination: '/start',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
