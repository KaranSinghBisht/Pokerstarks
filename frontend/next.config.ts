import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // WASM modules used by bot prover in API routes (server-side)
  serverExternalPackages: ["@noir-lang/noir_js", "@aztec/bb.js", "@fatsolutions/she"],
  // Turbopack config (Next.js 16 default bundler)
  turbopack: {},
  // Webpack fallback for older compatibility
  webpack: (config) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    // Required for @aztec/bb.js WASM modules
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
    };
    return config;
  },
};

export default nextConfig;
