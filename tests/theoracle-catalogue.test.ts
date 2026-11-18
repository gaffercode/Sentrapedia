// The catalogue left the client bundle on 2026-11-18 (docs/plans/active/public-repo-private-data-plan.md, decision A):
// the server reads it from the data folder and answers through signed-in API routes with hard caps.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccessResult } from "../src/lib/auth/policy";
import { createAadiGateway } from "../src/lib/aadi/gateway";
import type { Disease } from "../src/lib/theoracle";
import { createCatalogueApi, createDetailQuota, DAILY_DETAIL_LIMIT, jakartaDay, SEARCH_LIMIT } from "../src/lib/theoracle-catalogue-api";
import type { LoadedCatalogue } from "../src/lib/theoracle-catalogue";

const disease = (id: number, kode = "Z00"): Disease => ({ id, nama: `Penyakit uji ${id}`, kode, kategori: id % 2 ? "Ganjil" : "Genap", definisi: `Definisi rahasia ${id}`, gejala: ["Gejala uji"], diagnosis: "Diagnosis uji", terapi: `Terapi rahasia ${id}`, rujukan: "Rujukan uji" });
const catalogue: LoadedCatalogue = { diseases: Array.from({ length: 45 }, (_, i) => disease(i + 1)), meta: { version: "uji", sample: false, declaredCategories: 2 }, installed: true };
const allowed = async (): Promise<AccessResult> => ({ status: "allowed", userId: "user_uji" });
const api = (access = allowed, quota = createDetailQuota()) => createCatalogueApi({ access, catalogue: () => catalogue, quota });
const get = (path: string) => new Request(`http://localhost${path}`);

describe("catalogue API", () => {
  it("answers 401 to every route without a session and reads nothing", async () => {
    const read = vi.fn(() => catalogue);
    const closed = createCatalogueApi({ access: async () => ({ status: "signed-out" }), catalogue: read });
    for (const response of [await closed.index(), await closed.search(get("/api/theoracle/search?q=uji")), await closed.disease("1")]) {
      expect(response.status).toBe(401);
      expect(JSON.stringify(await response.json())).not.toContain("rahasia");
    }
    expect(read).not.toHaveBeenCalled();
  });

  it("search returns at most 20 entries with only id, nama, kode and kategori, and the full count", async () => {
    const body = await (await api().search(get("/api/theoracle/search?q=uji"))).json();
    expect(body.total).toBe(45);
    expect(body.items).toHaveLength(SEARCH_LIMIT);
    for (const item of body.items) expect(Object.keys(item).sort()).toEqual(["id", "kategori", "kode", "nama"]);
    expect(JSON.stringify(body)).not.toContain("rahasia");
    const filtered = await (await api().search(get("/api/theoracle/search?kategori=Genap"))).json();
    expect(filtered.items.every((d: Disease) => d.kategori === "Genap")).toBe(true);
    expect((await api().search(get(`/api/theoracle/search?q=${"x".repeat(201)}`))).status).toBe(400);
  });

  it("the index carries the four fields of every entry and no clinical text", async () => {
    const body = await (await api().index()).json();
    expect(body.entries).toHaveLength(45);
    expect(JSON.stringify(body)).not.toMatch(/rahasia|definisi|terapi/);
    expect(body.source).toMatchObject({ version: "uji", sample: false, installed: true });
  });

  it("detail returns one record, 404 for an unknown id, 400 for a malformed one", async () => {
    const open = api();
    expect((await (await open.disease("3")).json()).disease).toEqual(disease(3));
    expect((await open.disease("999")).status).toBe(404);
    expect((await open.disease("1;drop")).status).toBe(400);
  });

  it("caps detail reads at 300 per person per Jakarta day and resets at 00.00 WIB", async () => {
    let now = new Date("2026-11-18T16:59:00Z"); // 23.59 WIB
    const quota = createDetailQuota(DAILY_DETAIL_LIMIT, () => now);
    const open = api(allowed, quota);
    for (let i = 0; i < DAILY_DETAIL_LIMIT; i++) expect((await open.disease("1")).status).toBe(200);
    const refused = await open.disease("1");
    expect(refused.status).toBe(429);
    expect((await refused.json()).error.code).toBe("DETAIL_LIMIT");
    const other = createCatalogueApi({ access: async () => ({ status: "allowed", userId: "user_lain" }), catalogue: () => catalogue, quota });
    expect((await other.disease("1")).status).toBe(200);
    now = new Date("2026-11-18T17:00:00Z"); // 00.00 WIB on 19 November
    expect(jakartaDay(now)).toBe("2026-11-19");
    expect((await open.disease("1")).status).toBe(200);
  });
});

describe("analysis responses", () => {
  it("attach only the catalogue records the result's codes cover", async () => {
    const result = { contractVersion: "1", status: "ok", differential: { likely: [{ icd10: "J00", label: "Uji", confidenceTier: "low" }], alternatives: [], cannotMiss: [] }, evidence: [], missingInformation: [], nextBestActions: [], disposition: null, unfilled: [], meta: { version: "t", model: "m", costUsd: 0 } };
    const gateway = createAadiGateway({ log: () => undefined, token: "t", fetchFn: async () => Response.json(result), catalogue: () => [disease(1, "J00"), disease(2, "K35")] });
    const caseData = { demographics: { ageYears: 30, sex: "unknown" }, chiefComplaint: "Keluhan uji", anamnesis: { freeText: "Uji" }, vitals: {}, physicalExam: [], results: [], currentMedications: [], knownConditions: [], allergies: [], facilityCapabilities: [] };
    const body = await (await gateway.step(new Request("http://localhost:3104/api/aadi", { method: "POST", headers: { Origin: "http://localhost:3104", "Content-Type": "application/json" }, body: JSON.stringify({ case: caseData }) }))).json();
    expect(body.catalogue).toEqual([disease(1, "J00")]);
  });
});

describe("without the data folder", () => {
  const previous = process.env.SENTRAPEDIA_DATA_DIR;
  const empty = mkdtempSync(join(tmpdir(), "sentrapedia-no-data-"));
  afterEach(() => { if (previous === undefined) delete process.env.SENTRAPEDIA_DATA_DIR; else process.env.SENTRAPEDIA_DATA_DIR = previous; vi.resetModules(); });

  it("the catalogue falls back to the marked sample and says the database is not installed", async () => {
    process.env.SENTRAPEDIA_DATA_DIR = empty;
    vi.resetModules();
    const { loadCatalogue, CATALOGUE_NOT_INSTALLED } = await import("../src/lib/theoracle-catalogue");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const loaded = loadCatalogue();
    expect(loaded).toMatchObject({ installed: false, meta: { sample: true } });
    expect(warn).toHaveBeenCalledWith(CATALOGUE_NOT_INSTALLED);
    expect(CATALOGUE_NOT_INSTALLED).toMatch(/belum terpasang/);
    warn.mockRestore();
  });

  it("grounding refuses the case with the 'belum terpasang' message", async () => {
    process.env.SENTRAPEDIA_DATA_DIR = empty;
    vi.resetModules();
    const { retrieveTheOracleGrounding } = await import("../src/lib/theoracle-grounding");
    const caseData = { demographics: { ageYears: 30, sex: "unknown" as const }, chiefComplaint: "Keluhan uji", anamnesis: { freeText: "Uji" }, vitals: {}, physicalExam: [], results: [], currentMedications: [], knownConditions: [], allergies: [], facilityCapabilities: [] };
    await expect(retrieveTheOracleGrounding(caseData)).rejects.toThrow(/belum terpasang/);
    rmSync(empty, { recursive: true, force: true });
  });
});
