import { join } from 'node:path';
import type { NextConfig } from 'next';
import { webappConfigEnv } from './lib/firebase/webapp-config-env';

const config: NextConfig = {
  // The Playwright server sets this so it can run beside the everyday dev server (`next dev`
  // locks its dist dir). Unset, nothing changes.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // Workspace packages ship TypeScript source.
  transpilePackages: [
    '@motionpop/schemas',
    '@motionpop/motion',
    '@motionpop/ai',
    '@motionpop/render',
  ],
  // The development-only offline render route loads Chrome and the HyperFrames producer at run
  // time (`@motionpop/render/offline`). They are Node tools, not bundle material.
  serverExternalPackages: ['@hyperframes/producer', 'puppeteer', 'tsx'],
  // App Hosting runs the standalone server: trace from the workspace root, and ship the composition
  // runtime that /api/composition/assets reads from packages/motion/dist at run time.
  outputFileTracingRoot: join(import.meta.dirname, '..', '..'),
  outputFileTracingIncludes: {
    '/api/composition/assets': ['../../packages/motion/dist/**/*'],
    '/api/composition/maps/[file]': ['../../packages/motion/dist/maps/**/*'],
    '/api/composition/reel-custom': ['../../packages/motion/dist/reel-custom.js'],
    '/api/composition/reel-fonts': ['../../packages/motion/dist/reel-fonts.json'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), geolocation=()' },
        ],
      },
    ];
  },
  reactStrictMode: true,
  // On App Hosting the web config arrives as FIREBASE_WEBAPP_CONFIG; inline it as NEXT_PUBLIC_*.
  env: webappConfigEnv(process.env),
  // The dev badge sits on the timeline's AUDIO label and skews design checks.
  devIndicators: false,
};

export default config;
