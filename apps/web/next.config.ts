import type { NextConfig } from 'next';

const config: NextConfig = {
  // The Playwright server sets this so it can run beside the everyday dev server (`next dev`
  // locks its dist dir). Unset, nothing changes.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // Workspace packages ship TypeScript source.
  transpilePackages: ['@motionpop/schemas', '@motionpop/motion', '@motionpop/ai'],
  reactStrictMode: true,
  // The dev badge sits on the timeline's AUDIO label and skews design checks.
  devIndicators: false,
};

export default config;
