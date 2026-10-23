import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Leaflet pages and product photos are served only to signed-in visitors (see src/proxy.ts), so no shared caching.
  async headers() {
    return [
      {
        source: "/catalog/:path*",
        headers: [{ key: "Cache-Control", value: "private, max-age=86400, stale-while-revalidate=604800" }],
      },
      {
        source: "/products/:path*",
        headers: [{ key: "Cache-Control", value: "private, max-age=86400, stale-while-revalidate=604800" }],
      },
    ];
  },
};

export default nextConfig;
