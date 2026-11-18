import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  // Loaded at runtime from node_modules (native ONNX binaries); never bundled.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "sharp"],
  // transformers.js loads onnxruntime-node through createRequire and sharp's addon needs its
  // libvips libraries, neither of which tracing follows; ship both for the platform that builds
  // (Linux x64 in Docker).
  outputFileTracingIncludes: {
    "/api/aadi": [
      "./node_modules/onnxruntime-node/package.json",
      "./node_modules/onnxruntime-node/dist/**",
      `./node_modules/onnxruntime-node/bin/napi-v6/${process.platform}/${process.arch}/**`,
      "./node_modules/onnxruntime-common/**",
      `./node_modules/@img/sharp-*${process.platform}-${process.arch}/**`,
    ],
  },
  // The private data (scripts/private-data.mjs) is read at run time from SENTRAPEDIA_DATA_DIR and must never ride along
  // in the server output, whatever the tracer infers from the file paths (2026-11-18; checked by scripts/leak-guard.mjs).
  outputFileTracingExcludes: Object.fromEntries(["/*", "/**"].map(route => [route, ["./theoracle/index/**", "./theoracle/ssot/**", "./theoracle/library/**", "./oracle/sentrapedia.json", "./oracle-ii/**", "./docs/**", "./.agents/**", "./deploy/**", "./aadi/service/data/icd10.json", "./aadi/service/DESIGN.md"]])),
  turbopack: { root: process.cwd() },
  devIndicators: false,
  // Set by the Next.js security upgrade agent (16.4.2 -> 16.4.6, 2026-11-18).
  experimental: { agentUpgrade: "security" },
};

export default config;
