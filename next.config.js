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
  // Configure headers with caching
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          // Cache static assets aggressively
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=31536000, stale-while-revalidate=86400',
          },
        ],
      },
      // No cache for API routes (server actions)
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-cache, no-store, must-revalidate',
          },
        ],
      },
    ]
  },
  // Increase header size limit to prevent HTTP 431 errors
  // This allows larger cookies/headers (default is usually 8KB)
  serverRuntimeConfig: {
    maxHeaderSize: 16384, // 16KB (increase if needed)
  },
}

module.exports = nextConfig
