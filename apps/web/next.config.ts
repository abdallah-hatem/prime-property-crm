import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The dev badge sits over the phone tab bar in screenshots.
  devIndicators: false,
  experimental: {
    // Next 16 caches Turbopack builds on disk by default; a stale cache has produced broken
    // production builds, so builds always start clean.
    turbopackFileSystemCacheForBuild: false,
  },
};

export default nextConfig;
