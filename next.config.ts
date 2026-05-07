import type { NextConfig } from "next";

const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Proxy backend calls when NEXT_PUBLIC_API_URL is set. While the backend is
  // mocked client-side (src/lib/api/hooks.ts), the rewrite is unnecessary —
  // skip it to avoid a build-time error from an unresolved destination.
  async rewrites() {
    if (!apiBase) return [];
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiBase}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
