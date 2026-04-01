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
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://api.razorpay.com https://cdn.razorpay.com https://www.googletagmanager.com https://www.google-analytics.com https://va.vercel-scripts.com",
              "script-src-elem 'self' 'unsafe-inline' https://checkout.razorpay.com https://api.razorpay.com https://cdn.razorpay.com https://www.googletagmanager.com https://www.google-analytics.com https://va.vercel-scripts.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https:",
              "connect-src 'self' https://*.supabase.co https://api.razorpay.com https://checkout.razorpay.com https://lumberjack.razorpay.com https://cdn.razorpay.com https://kycapi.microvistatech.com https://api.openai.com https://api.resend.com https://www.google-analytics.com https://analytics.google.com https://stats.g.doubleclick.net https://va.vercel-scripts.com",
              "frame-src https://checkout.razorpay.com https://api.razorpay.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
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
}

module.exports = nextConfig
