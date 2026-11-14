import type { NextConfig } from 'next';

const config: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ['@motionpop/schemas', '@motionpop/motion', '@motionpop/ai'],
  reactStrictMode: true,
};

export default config;
