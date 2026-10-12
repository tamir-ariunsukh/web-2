import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source; Next transpiles them so the app
  // and the packages never drift out of sync.
  transpilePackages: ['@repo/ui', '@repo/shared'],
  poweredByHeader: false,

  eslint: {
    // Linting runs as its own turbo task so a lint failure is reported once.
    ignoreDuringBuilds: true,
  },

  typescript: {
    // Type checking is a separate task; keep builds fast and deterministic.
    ignoreBuildErrors: false,
  },

  async headers() {
    return [
      {
        // Generated art is content-addressed by name and changes only when the
        // generator runs, so it can be cached hard.
        source: '/img/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
