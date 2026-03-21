/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['192.168.0.114', 'social-plane.teamlewis.co'],
  experimental: {
    optimizePackageImports: []
  },
  async rewrites() {
    return [
      {
        source: '/backend/:path*',
        destination: 'http://localhost:4001/:path*',
      },
    ];
  },
  output: 'standalone',
};

export default nextConfig;
