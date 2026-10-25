import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist'],
  // Demo files and recorded fixtures are read from disk at runtime, so the
  // serverless trace must include them explicitly.
  outputFileTracingIncludes: {
    '/api/**': ['./resources/demo/**/*'],
  },
};

export default nextConfig;
