import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // turbopack is enabled via --turbopack flag in dev script
  },
  // Proxy WebSocket and API calls to backend during dev
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination:
          process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") + "/api/v1/:path*" ||
          "http://localhost:8000/api/v1/:path*",
      },
    ];
  },
};

export default nextConfig;
