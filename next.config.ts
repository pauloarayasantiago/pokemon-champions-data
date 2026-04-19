import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native / large deps used by @core/rag; don't try to bundle them.
  serverExternalPackages: [
    "@huggingface/transformers",
    "onnxruntime-node",
  ],
  transpilePackages: [],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
