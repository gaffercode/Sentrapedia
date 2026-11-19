import type { Disease, SkdiLevel } from "./theoracle";

// The SKDI competency level beside AADI's disposition (docs/FEATURE-IDEAS.md idea 1). It is advisory: each line names
// the catalogue record it comes from, it never replaces or rewrites the disposition, and the closing note says the
// referral stays the doctor's decision. A record without a clean level adds nothing.
const meanings: Record<SkdiLevel, string> = {
  "4A": "dokter umum mendiagnosis dan menatalaksana sampai tuntas di FKTP",
  "4B": "dokter umum menatalaksana sampai tuntas setelah internsip",
  "3B": "dokter umum mendiagnosis, memberi terapi pendahuluan pada keadaan gawat darurat, lalu merujuk",
  "3A": "dokter umum mendiagnosis, memberi terapi pendahuluan pada keadaan bukan gawat darurat, lalu merujuk",
  "2": "dokter umum mendiagnosis lalu merujuk",
  "1": "dokter umum mengenali lalu merujuk",
};

export function skdiLines(records: readonly Disease[]): string[] {
  const lines = records.flatMap(d => d.skdi ? [`**Kompetensi SKDI (katalog):** ${d.nama} (${d.kode}) — SKDI ${d.skdi}: ${meanings[d.skdi]}.`] : []);
  return lines.length ? [...lines, "Level kompetensi bukan keputusan rujuk; keputusan tetap pada dokter."] : [];
}
