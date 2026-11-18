import { accessFailure, errorResponse } from "./auth/access";
import type { AccessResult } from "./auth/policy";
import { catalogueEntry, searchDiseases, theOracleSource } from "./theoracle";
import { CATALOGUE_NOT_INSTALLED, type LoadedCatalogue } from "./theoracle-catalogue";

// The catalogue API behind /api/theoracle/* (Gaffer, 2026-11-18, decision A): signed in only, search answers at most
// 20 entries with four fields, and one person opens at most 300 disease records per day (Asia/Jakarta). The records an
// analysis cites travel with /api/aadi instead and are not counted here.
export const SEARCH_LIMIT = 20;
export const DAILY_DETAIL_LIMIT = 300;
const QUERY_MAX = 200;
const ok = (body: unknown) => Response.json(body, { headers: { "Cache-Control": "no-store" } });

/** Today's date in Asia/Jakarta (UTC+7, no daylight saving): the count turns over at 00.00 WIB. */
export const jakartaDay = (now: Date) => new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

// Kept in the process, like the analysis line (queue.ts): a restart forgives the day's reads, which this cap can afford,
// because it slows bulk copying of the catalogue and is not a billing limit.
export function createDetailQuota(limit = DAILY_DETAIL_LIMIT, now: () => Date = () => new Date()) {
  const used = new Map<string, number>();
  return {
    take(user: string): boolean {
      const day = jakartaDay(now());
      for (const key of used.keys()) if (!key.startsWith(`${day} `)) used.delete(key);
      const key = `${day} ${user}`;
      const count = used.get(key) ?? 0;
      if (count >= limit) return false;
      used.set(key, count + 1);
      return true;
    },
  };
}

type Deps = { access: () => Promise<AccessResult>; catalogue: () => LoadedCatalogue; quota?: ReturnType<typeof createDetailQuota> };

export function createCatalogueApi(deps: Deps) {
  const quota = deps.quota ?? createDetailQuota();
  const source = (loaded: LoadedCatalogue) => ({ ...theOracleSource, ...loaded.meta, installed: loaded.installed, ...(loaded.installed ? {} : { message: CATALOGUE_NOT_INSTALLED }) });
  async function signedIn(): Promise<{ userId: string } | Response> {
    const access = await deps.access();
    return access.status === "allowed" ? { userId: access.userId } : accessFailure(access);
  }
  return {
    /** id, nama, kode and kategori of every entry: what the evidence gate and a draft's names need, no clinical text. */
    async index(): Promise<Response> {
      const who = await signedIn(); if (who instanceof Response) return who;
      const loaded = deps.catalogue();
      return ok({ source: source(loaded), entries: loaded.diseases.map(catalogueEntry) });
    },
    async search(request: Request): Promise<Response> {
      const who = await signedIn(); if (who instanceof Response) return who;
      const params = new URL(request.url).searchParams;
      const query = params.get("q") ?? "", category = params.get("kategori") || "all";
      if (query.length > QUERY_MAX || category.length > QUERY_MAX) return errorResponse(400, "INPUT", "Kata kunci terlalu panjang.");
      const found = searchDiseases(deps.catalogue().diseases, query, category);
      return ok({ total: found.length, items: found.slice(0, SEARCH_LIMIT).map(catalogueEntry) });
    },
    async disease(id: string): Promise<Response> {
      const who = await signedIn(); if (who instanceof Response) return who;
      if (!/^\d{1,6}$/.test(id)) return errorResponse(400, "INPUT", "Nomor penyakit tidak valid.");
      const loaded = deps.catalogue();
      const disease = loaded.diseases.find(d => d.id === Number(id));
      if (!disease) return errorResponse(404, "NOT_FOUND", "Penyakit tidak ditemukan di katalog.");
      if (!quota.take(who.userId)) return errorResponse(429, "DETAIL_LIMIT", `Batas ${DAILY_DETAIL_LIMIT} detail penyakit per hari tercapai. Kuota kembali pukul 00.00 WIB.`);
      return ok({ source: source(loaded), disease });
    },
  };
}
