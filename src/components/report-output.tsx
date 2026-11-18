"use client";

import { useState, type FormEvent } from "react";
import { Flag } from "lucide-react";
import { containsIdentity } from "../lib/aadi/contract";
import type { ReportCategory } from "../lib/aadi/output-report";

// maxReportNoteLength in output-report.ts, which the server enforces; a type-only import keeps its server code out of the bundle.
const maxReportNoteLength = 1000;

const categories: { value: ReportCategory; label: string }[] = [
  { value: "incorrect", label: "Tidak tepat" },
  { value: "unsafe", label: "Tidak aman" },
  { value: "other", label: "Lainnya" },
];

/** "Laporkan output bermasalah" under one AADI answer, named by its trace id. Sends no case text and no answer. */
export function ReportOutput({ traceId }: { traceId: string }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ReportCategory | "">("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!category || state === "sending") return;
    if (containsIdentity(note)) { setError("Hapus pola identitas dari catatan: nama, nomor identitas, kontak atau alamat."); return; }
    setState("sending"); setError(null);
    try {
      const response = await fetch("/api/aadi/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ traceId, category, note }), signal: AbortSignal.timeout(10_000) });
      if (response.ok) { setState("sent"); return; }
      const body = await response.json().catch(() => null) as { error?: { message?: unknown } } | null;
      setError(typeof body?.error?.message === "string" ? body.error.message : "Laporan belum tersimpan. Coba kembali.");
    } catch { setError("Laporan belum tersimpan. Coba kembali."); }
    setState("idle");
  }
  if (state === "sent") return <p className="report-output panel-caption" role="status">Laporan terkirim untuk ditinjau. Terima kasih.</p>;
  if (!open) return <button type="button" className="text-button report-output" onClick={() => setOpen(true)}><Flag size={12}/> Laporkan output bermasalah</button>;
  return <form className="report-output report-output-form" onSubmit={submit}>
    <fieldset disabled={state === "sending"}>
      <legend>Laporkan output bermasalah</legend>
      {categories.map(item => <label key={item.value}><input type="radio" name={`report-${traceId}`} value={item.value} checked={category === item.value} onChange={() => setCategory(item.value)}/> {item.label}</label>)}
      <label className="report-output-note">Catatan (opsional), tanpa identitas pasien<textarea value={note} maxLength={maxReportNoteLength} rows={3} onChange={event => setNote(event.target.value)}/></label>
      {error && <p className="form-warning" role="alert">{error}</p>}
      <div className="editor-actions"><button type="submit" className="button primary" disabled={!category}>{state === "sending" ? "Mengirim…" : "Kirim laporan"}</button><button type="button" className="button" onClick={() => { setOpen(false); setError(null); }}>Batal</button></div>
    </fieldset>
  </form>;
}
