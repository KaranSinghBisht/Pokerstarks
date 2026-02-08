import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
