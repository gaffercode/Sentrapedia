import type { ReviewStatus } from "./workspace";

// "Cetak" prints one document, not the whole workspace (docs/FEATURE-IDEAS.md idea 2). The stylesheet's @media print
// block (globals.css) shows only the element marked here and prints its status line. A printed draft looks official,
// so a draft says plainly that no physician has reviewed it.
export function printStatusLabel(status: ReviewStatus | undefined): string {
  if (status === "reviewed") return "Status: Ditinjau";
  if (status === "final") return "Status: Final";
  return "Draf — belum ditinjau dokter. Bukan resep atau instruksi final.";
}

/** Prints `target` alone with its status, or the whole page without a target. The markers never outlive the call. */
export function printDocument(target: Element | null, status: ReviewStatus | undefined): void {
  if (!target) { window.print(); return; }
  const root = document.documentElement;
  root.setAttribute("data-printing", "");
  target.setAttribute("data-print-target", "");
  target.setAttribute("data-print-status", printStatusLabel(status));
  try { window.print(); }
  finally {
    root.removeAttribute("data-printing");
    target.removeAttribute("data-print-target");
    target.removeAttribute("data-print-status");
  }
}
