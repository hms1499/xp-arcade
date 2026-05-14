import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  experimental: {
    // Scope hoisting + nested async chunking (both enabled by default in
    // Turbopack production builds) break the @reown/appkit dependency tree
    // that @stacks/connect pulls in, causing "module factory not available"
    // errors at runtime. Disabling them restores webpack-like behaviour.
    turbopackScopeHoisting: false,
    turbopackClientSideNestedAsyncChunking: false,
  },
};

export default nextConfig;
