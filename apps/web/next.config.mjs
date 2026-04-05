import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Resolve through symlinks so Turbopack's sandbox includes the real node_modules location
const monorepoRoot = realpathSync(resolve(__dirname, '../..'));

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: (process.env.ALLOWED_DEV_ORIGINS || '').split(',').filter(Boolean),
  turbopack: {
    root: monorepoRoot,
  },
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
