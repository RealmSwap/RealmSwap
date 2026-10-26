/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
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
