import type { NextConfig } from "next";
import path from "path";

const projectRoot = path.resolve(__dirname, "..");

const nextConfig: NextConfig = {
  // Native / large deps used by @core/rag; don't try to bundle them.
  serverExternalPackages: [
    "@huggingface/transformers",
    "onnxruntime-node",
  ],
  transpilePackages: [],
  // Vercel deployment: trace files outside webapp/ so ../lib and ../*.csv
  // are included in the serverless bundle.
  outputFileTracingRoot: projectRoot,
  // Turbopack dev: silence the multi-lockfile warning and match trace root.
  turbopack: {
    root: projectRoot,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
