/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  async redirects() {
    return [
      {
        source: '/',
        destination: '/start',
        permanent: false,
      },
    ];
  },
  webpack(config, { isServer }) {
    if (isServer) {
      // Externalize native Node addons used by ssh2 (SFTP hosting feature).
      // Webpack cannot bundle .node binary files; they must be required at runtime.
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean)),
        ({ request }, callback) => {
          if (/\.node$/.test(request)) return callback(null, `commonjs ${request}`);
          callback();
        },
        "ssh2",
        "ssh2-sftp-client",
      ];
    }
    return config;
  },
};

export default nextConfig;
