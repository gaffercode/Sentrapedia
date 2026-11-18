import { catalogueIndex, setCatalogueIndex, validDisease, validEntry, type CatalogueEntry, type Disease } from "./theoracle";

// Browser side of the catalogue API (src/lib/theoracle-catalogue-api.ts). Errors carry the server's Indonesian message.
export interface CatalogueSource { file: string; hash: string; version: string; sample: boolean; declaredCategories: number; installed: boolean; message?: string }

const failure = (body: unknown, fallback: string) => {
  const error = body && typeof body === "object" && "error" in body && body.error && typeof body.error === "object" ? body.error : {};
  return new Error("message" in error && typeof error.message === "string" ? error.message : fallback);
};
async function read(fetchFn: typeof fetch, url: string, fallback: string): Promise<Record<string, unknown>> {
  let response: Response; let body: unknown;
  try { response = await fetchFn(url, { cache: "no-store" }); body = await response.json(); }
  catch { throw new Error(fallback); }
  if (!response.ok || !body || typeof body !== "object") throw failure(body, fallback);
  return body as Record<string, unknown>;
}
const validSource = (value: unknown): value is CatalogueSource => !!value && typeof value === "object" && typeof (value as CatalogueSource).version === "string" && typeof (value as CatalogueSource).sample === "boolean" && typeof (value as CatalogueSource).installed === "boolean";

let pending: Promise<void> | undefined;
/** True when the index is in memory, so code that reads it synchronously (the gate, the drafts) can run. */
export const catalogueIndexReady = () => catalogueIndex().length > 0;
/** Loads the catalogue index once per page; the evidence gate and the drafts' names read it from src/lib/theoracle.ts. */
export function ensureCatalogueIndex(fetchFn: typeof fetch = fetch): Promise<void> {
  if (catalogueIndexReady()) return Promise.resolve();
  pending ??= read(fetchFn, "/api/theoracle/index", "Katalog penyakit tidak dapat dimuat.").then(body => {
    if (!validSource(body.source) || !Array.isArray(body.entries) || !body.entries.length || body.entries.length > 5000 || !body.entries.every(validEntry)) throw new Error("Katalog penyakit tidak dapat dimuat.");
    setCatalogueIndex(body.entries, body.source);
  }).finally(() => { pending = undefined; });
  return pending;
}

export async function searchCatalogue(query: string, category: string, fetchFn: typeof fetch = fetch): Promise<{ total: number; items: CatalogueEntry[] }> {
  const params = new URLSearchParams({ q: query, kategori: category });
  const body = await read(fetchFn, `/api/theoracle/search?${params}`, "Pencarian katalog gagal. Coba kembali.");
  if (typeof body.total !== "number" || !Array.isArray(body.items) || !body.items.every(validEntry)) throw new Error("Pencarian katalog gagal. Coba kembali.");
  return { total: body.total, items: body.items };
}

export async function readDisease(id: number, fetchFn: typeof fetch = fetch): Promise<Disease> {
  const body = await read(fetchFn, `/api/theoracle/disease/${id}`, "Detail penyakit tidak dapat dimuat.");
  if (!validDisease(body.disease)) throw new Error("Detail penyakit tidak dapat dimuat.");
  return body.disease;
}
