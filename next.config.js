/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Increase header size limits to prevent 431 errors
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  // Transpile packages that need to be processed
  transpilePackages: ['@react-email/render', 'prettier'],
  // Configure headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
