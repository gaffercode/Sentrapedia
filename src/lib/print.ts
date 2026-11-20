import type { ReviewStatus } from "./workspace";

// "Cetak" prints one document, not the whole workspace (docs/FEATURE-IDEAS.md idea 2). The stylesheet's @media print
// block (globals.css) shows only the element marked here and prints its status line. A printed draft looks official,
// so a draft says plainly that no physician has reviewed it.
export function printStatusLabel(status: ReviewStatus | undefined): string {
  if (status === "reviewed") return "Status: Ditinjau";
  if (status === "final") return "Status: Final";
  return "Draf — belum ditinjau dokter. Bukan resep atau instruksi final.";
}

let clearMarkers: (() => void) | null = null;

/** Prints `target` alone with its status, or the whole page without a target. The markers last until "afterprint",
 * because print() returns before the dialog closes on some browsers (iOS); a failed print or the next print clears them. */
export function printDocument(target: Element | null, status: ReviewStatus | undefined): void {
  clearMarkers?.();
  if (!target) { window.print(); return; }
  const root = document.documentElement;
  root.setAttribute("data-printing", "");
  target.setAttribute("data-print-target", "");
  target.setAttribute("data-print-status", printStatusLabel(status));
  const clear = () => {
    window.removeEventListener("afterprint", clear);
    root.removeAttribute("data-printing");
    target.removeAttribute("data-print-target");
    target.removeAttribute("data-print-status");
    if (clearMarkers === clear) clearMarkers = null;
  };
  clearMarkers = clear;
  window.addEventListener("afterprint", clear);
  try { window.print(); }
  catch (error) { clear(); throw error; }
}
