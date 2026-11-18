import { readFileSync } from "node:fs";
import path from "node:path";
import { dataPath } from "./data-dir";
import { addCatalogueRecords, catalogueEntry, setCatalogueIndex, validDisease, type CatalogueMeta, type Disease } from "./theoracle";

// Server side of the catalogue (Gaffer, 2026-11-18): read once from the data folder, never bundled into client code.
// Without the private file the fictional sample from the code tree is used, and it says so; it never answers a case.
export const CATALOGUE_NOT_INSTALLED = "Katalog penyakit Sentrapedia belum terpasang di server ini. Yang tampil adalah katalog contoh tanpa isi klinis.";
export interface LoadedCatalogue { diseases: readonly Disease[]; meta: CatalogueMeta; installed: boolean }

function parse(file: string): { diseases: Disease[]; meta: CatalogueMeta } {
  const data: unknown = JSON.parse(readFileSync(file, "utf8"));
  const body = data && typeof data === "object" ? data as { metadata?: Record<string, unknown>; diseases?: unknown } : {};
  if (!Array.isArray(body.diseases) || !body.diseases.every(validDisease)) throw new Error(`${path.basename(file)}: daftar penyakit tidak valid.`);
  const metadata = body.metadata ?? {};
  return {
    diseases: body.diseases,
    meta: { version: String(metadata.version ?? ""), sample: metadata.sample === true, declaredCategories: Number(metadata.total_categories ?? 0) },
  };
}

let loaded: LoadedCatalogue | undefined;
/** The catalogue, cached for the life of the process. It also fills the shared index and records the evidence gate reads. */
export function loadCatalogue(): LoadedCatalogue {
  if (loaded) return loaded;
  let installed = true;
  let catalogue: ReturnType<typeof parse>;
  try { catalogue = parse(dataPath("oracle", "sentrapedia.json")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
    installed = false;
    catalogue = parse(path.join(process.cwd(), "oracle", "sentrapedia.sample.json"));
    catalogue.meta.sample = true;
    console.warn(CATALOGUE_NOT_INSTALLED);
  }
  setCatalogueIndex(catalogue.diseases.map(catalogueEntry), catalogue.meta);
  addCatalogueRecords(catalogue.diseases);
  loaded = { diseases: catalogue.diseases, meta: catalogue.meta, installed };
  return loaded;
}

/** For tests only: forget the cached catalogue so the next load reads the data folder again. */
export function resetCatalogueForTests() { loaded = undefined; }
