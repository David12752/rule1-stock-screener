import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  async redirects() {
    return [
      { source: "/library", destination: "/?tab=quality", permanent: false },
      { source: "/scanner", destination: "/?tab=timing", permanent: false },
      { source: "/watchlist", destination: "/?tab=portfolio", permanent: false },
      { source: "/portfolio", destination: "/?tab=portfolio", permanent: false },
    ];
  },
};

export default nextConfig;
