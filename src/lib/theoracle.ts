// The TheOracle disease catalogue, as the browser and the server both see it (Gaffer, 2026-11-18: the repository is
// public, the catalogue is not). This module never imports the catalogue file. The server fills it from the data
// folder (src/lib/theoracle-catalogue.ts); the browser fills it from authenticated API answers:
//   the index    id, nama, kode and kategori of every entry, for the evidence gate and the names in a draft;
//   the records  full entries, only those an analysis cited (attached by /api/aadi).

export interface Disease { id: number; nama: string; kategori: string; kode: string; definisi: string; gejala: string[]; diagnosis: string; terapi: string; rujukan: string }
export type CatalogueEntry = Pick<Disease, "id" | "nama" | "kode" | "kategori">;
export interface CatalogueMeta { version: string; sample: boolean; declaredCategories: number }

// The provenance of the real catalogue file: its SHA-256 identifies the reviewed version a draft cites.
export const theOracleSource = { file: "oracle/sentrapedia.json", hash: "3c9b32e6b01a22c63ff73c8d487bf4e8edc26e99aedcf9f3f89b32795b163fd1" } as const;

let index: readonly CatalogueEntry[] = [];
let meta: CatalogueMeta | null = null;
const records = new Map<number, Disease>();

export const catalogueEntry = ({ id, nama, kode, kategori }: CatalogueEntry): CatalogueEntry => ({ id, nama, kode, kategori });
export function setCatalogueIndex(entries: readonly CatalogueEntry[], next: CatalogueMeta) { index = entries.map(catalogueEntry); meta = next; }
export const catalogueIndex = (): readonly CatalogueEntry[] => index;
export const catalogueMeta = (): CatalogueMeta | null => meta;
export function addCatalogueRecords(list: readonly Disease[]) { for (const record of list) records.set(record.id, record); }
export const catalogueRecords = (): Disease[] => [...records.values()].sort((a, b) => a.id - b.id);
export const theOracleCategories = (entries: readonly CatalogueEntry[] = index) => [...new Set(entries.map(d => d.kategori))].sort((a, b) => a.localeCompare(b, "id"));

export function searchDiseases<T extends CatalogueEntry>(entries: readonly T[], query: string, category: string): T[] {
  const terms = query.trim().toLocaleLowerCase("id").split(/\s+/).filter(Boolean);
  return entries.filter(d => (category === "all" || d.kategori === category) && terms.every(term => `${d.nama} ${d.kode} ${d.kategori}`.toLocaleLowerCase("id").includes(term)));
}

// True when a catalog code field ("B36.0", "B20-B24", "L01, L08") covers an ICD-10 code.
export function referenceIncludes(sourceCode: string, code: string): boolean {
  if (!/^[A-Z]\d{2}(?:\.[A-Z0-9]{1,4})?$/.test(code)) return false;
  return sourceCode.toUpperCase().split(",").some(value => {
    const token = value.trim();
    const range = /^([A-Z]\d{2})-([A-Z]\d{2})$/.exec(token);
    return range ? code.slice(0, 3) >= range[1] && code.slice(0, 3) <= range[2] : code === token || code.startsWith(token + ".");
  });
}

/** The records whose code field covers one of the codes, in the order given. */
export const recordsForCodes = <T extends Pick<Disease, "kode">>(list: readonly T[], codes: Iterable<string>) => { const wanted = [...codes].map(code => code.toUpperCase()); return list.filter(d => wanted.some(code => referenceIncludes(d.kode, code))); };

const text = (value: unknown, max: number) => typeof value === "string" && value.length <= max;
/** An index entry as the API sends it; anything else is refused. */
export function validEntry(value: unknown): value is CatalogueEntry {
  if (!value || typeof value !== "object") return false;
  const d = value as Record<string, unknown>;
  return Number.isInteger(d.id) && text(d.nama, 300) && text(d.kode, 200) && text(d.kategori, 300);
}
/** A full catalogue record as the API sends it; anything else is refused. */
export function validDisease(value: unknown): value is Disease {
  if (!validEntry(value)) return false;
  const d = value as unknown as Record<string, unknown>;
  return text(d.definisi, 50_000) && text(d.diagnosis, 50_000) && text(d.terapi, 100_000) && text(d.rujukan, 50_000) && Array.isArray(d.gejala) && d.gejala.length <= 200 && d.gejala.every(g => text(g, 2_000));
}
