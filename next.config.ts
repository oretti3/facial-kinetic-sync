import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/facial-kinetic-sync",
  assetPrefix: "/facial-kinetic-sync/",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
