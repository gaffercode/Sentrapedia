import { describe, expect, it } from "vitest";
import { skdiLines } from "../src/lib/skdi";
import type { Disease } from "../src/lib/theoracle";

// The SKDI level is advisory (docs/FEATURE-IDEAS.md idea 1): it names the catalogue record it comes from and never decides
// the referral.
const record = (id: number, nama: string, kode: string, skdi?: Disease["skdi"]): Disease => ({ id, nama, kode, kategori: "Contoh", definisi: "", gejala: [], diagnosis: "", terapi: "", rujukan: "", ...(skdi === undefined ? {} : { skdi }) });
const note = "Level kompetensi bukan keputusan rujuk; keputusan tetap pada dokter.";

describe("skdiLines", () => {
  it("writes one named line per record with a level, then the note", () => {
    expect(skdiLines([record(1, "Penyakit A", "A00", "4A"), record(2, "Penyakit B", "B00", "3B")])).toEqual([
      "**Kompetensi SKDI (katalog):** Penyakit A (A00) — SKDI 4A: dokter umum mendiagnosis dan menatalaksana sampai tuntas di FKTP.",
      "**Kompetensi SKDI (katalog):** Penyakit B (B00) — SKDI 3B: dokter umum mendiagnosis, memberi terapi pendahuluan pada keadaan gawat darurat, lalu merujuk.",
      note,
    ]);
  });
  it("writes nothing for a record without a level, including one saved before levels existed", () => {
    expect(skdiLines([record(1, "Penyakit A", "A00", null), record(2, "Penyakit B", "B00")])).toEqual([]);
  });
  it("skips the records without a level and keeps the others", () => {
    expect(skdiLines([record(1, "Penyakit A", "A00"), record(2, "Penyakit B", "B00", "3A")])).toEqual([
      "**Kompetensi SKDI (katalog):** Penyakit B (B00) — SKDI 3A: dokter umum mendiagnosis, memberi terapi pendahuluan pada keadaan bukan gawat darurat, lalu merujuk.",
      note,
    ]);
  });
});
