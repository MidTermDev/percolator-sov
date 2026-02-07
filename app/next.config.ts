import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: ["@percolator/core"],
  turbopack: {
    resolveAlias: {
      buffer: "buffer",
    },
  },
};

export default nextConfig;
