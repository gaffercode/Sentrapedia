import { existsSync } from "node:fs";
import { loadCatalogue } from "../src/lib/theoracle-catalogue";

// Public code, private data (2026-10-19): the public repository carries the fictional sample catalogue and no TheOracle
// index, so tests that read the real catalogue or index skip there and run wherever the private data is installed.
export const withCatalog = !loadCatalogue().meta.sample;
export const withIndex = existsSync("theoracle/index/manifest.json") && existsSync("theoracle/index/vectors.f32");
// The knowledge SSOT is private too (theoracle/ssot/); scripts/knowledge-ssot.mjs reads it when imported.
export const withSsot = existsSync("theoracle/ssot/sentrapedia-knowledge-ssot.json");
