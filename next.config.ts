import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Leaflet pages and product photos are served only to signed-in visitors (see src/proxy.ts), so no shared caching.
  async headers() {
    const noStore = [{ key: "Cache-Control", value: "no-store, max-age=0" }];
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      { source: "/prijava", headers: noStore },
      { source: "/aktivacija", headers: noStore },
      { source: "/skrbnik", headers: noStore },
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
