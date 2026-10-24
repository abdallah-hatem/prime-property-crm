import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The dev badge sits over the phone tab bar in screenshots.
  devIndicators: false,
  // Lets a phone on the same Wi-Fi open the dev server by LAN IP (DEV_ORIGINS=192.168.1.2).
  allowedDevOrigins: process.env.DEV_ORIGINS?.split(',').filter(Boolean),
  experimental: {
    // Next 16 caches Turbopack builds on disk by default; a stale cache has produced broken
    // production builds, so builds always start clean.
    turbopackFileSystemCacheForBuild: false,
    // Import files go through a server action (the bearer stays on the server): 4 MB file
    // (IMPORT_MAX_BYTES) plus multipart overhead. The default is 1 MB.
    serverActions: { bodySizeLimit: '5mb' },
  },
};

export default nextConfig;
