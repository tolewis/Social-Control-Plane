/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['192.168.0.114'],
  experimental: {
    optimizePackageImports: []
  }
};

export default nextConfig;
