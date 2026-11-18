// Files that belong to the private data repository, never to the public code repository (Gaffer, 2026-10-19:
// public code under the royalty licence, private database). Folders end with "/". Used by scripts/export-split.mjs
// and scripts/leak-guard.mjs, and pinned by tests/export-split.node-test.mjs.
export const PRIVATE_PATHS = [
  "theoracle/ssot/", // the single knowledge source; the index and the catalogue are derived from it
  "theoracle/index/", // TheOracle: chunks, vectors and manifest
  "theoracle/library/", // the guideline-library passages, the source the chunk build reads
  "oracle/sentrapedia.json", // the clinical catalogue, derived from the SSOT by npm run knowledge:build
  "oracle-ii/",
  "docs/verification/", // evidence files quote passages, doses and live outputs
  ".agents/", // internal working notes
  "deploy/beta/", // closed-beta server layout and access setup
  "aadi/service/DESIGN.md", // upstream's private design notes (local paths, the crew portal's login)
  // Gaffer, 2026-11-18 (decision E): the internal documents (weaknesses with file and line, the server, the plans) and
  // the ICD-10 list, whose redistribution licence is unverified (aadi/service/data/SOURCE.md).
  "docs/security/",
  "docs/operations/",
  "docs/architecture/",
  "docs/plans/",
  "docs/specs/",
  "docs/engineering/",
  "docs/governance/",
  "docs/product/",
  "docs/integrations/",
  "docs/DESIGN-AUDIT.md",
  "docs/TECH-DEBT.md",
  "aadi/service/data/icd10.json",
];

// The public tree gets these marked samples in place of the private files, so the app builds and says it is a sample.
export const SAMPLES = [
  { from: "oracle/sentrapedia.sample.json", to: "oracle/sentrapedia.json" },
  { from: "aadi/service/data/icd10.sample.json", to: "aadi/service/data/icd10.json" },
];

export const isPrivate = file => PRIVATE_PATHS.some(entry => entry.endsWith("/") ? file.startsWith(entry) : file === entry);
