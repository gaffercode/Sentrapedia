// Browser side of POST /api/feedback (src/lib/feedback.ts). The outcome decides what the sidebar says; the text stays in
// the box on every outcome but "sent", so nothing the clinician wrote is lost to a failure.
export type FeedbackOutcome = "sent" | "unavailable" | "identity" | "failed";

export const feedbackFailure: Record<Exclude<FeedbackOutcome, "sent">, string> = {
  unavailable: "Masukan belum terkirim: penyimpanan belum aktif di instance ini.",
  identity: "Masukan memuat pola identitas. Hapus nama, nomor identitas, kontak dan alamat.",
  failed: "Masukan belum terkirim. Coba kembali.",
};

export async function sendWorkspaceFeedback(note: string): Promise<FeedbackOutcome> {
  try {
    const response = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ note }), cache: "no-store" });
    if (response.ok) return "sent";
    // Error answers use the capsule's envelope, { status: "error", error: { code, message } } (auth/access.ts). A 503
    // is "not active" only when the instance has no store; a store that failed to save asks for another try.
    const body = await response.json().catch(() => ({})) as { error?: { code?: unknown } };
    if (body.error?.code === "IDENTITY") return "identity";
    return response.status === 503 && body.error?.code !== "FEEDBACK_FAILED" ? "unavailable" : "failed";
  } catch { return "failed"; }
}
