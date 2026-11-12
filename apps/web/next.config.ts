import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Internal packages ship TypeScript source; Next compiles them.
  transpilePackages: ['@motionpop/schemas'],
};

export default nextConfig;
