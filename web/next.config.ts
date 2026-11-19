import type { NextConfig } from "next";

// The API is only reached through this server (same origin), so its address never
// ships to the browser and session cookies stay first-party.
const API_URL = process.env.AURALIS_API_URL ?? "http://127.0.0.1:8000";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  // No Next.js dev badge: the dev build is what gets demonstrated.
  devIndicators: false,
  poweredByHeader: false,
  images: {
    // Track artwork is proxied through the image optimiser, so browsers never
    // contact YouTube directly.
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com", pathname: "/vi/**" },
      // Spotify playlist covers, for playlists imported from there.
      { protocol: "https", hostname: "i.scdn.co", pathname: "/image/**" },
    ],
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
