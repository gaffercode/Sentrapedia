// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { printDocument, printStatusLabel } from "../../src/lib/print";

// "Cetak" prints one document, not the whole workspace (docs/FEATURE-IDEAS.md idea 2). A printed draft looks official,
// so the review status prints with it.
const draftLabel = "Draf — belum ditinjau dokter. Bukan resep atau instruksi final.";
const markers = () => [...document.querySelectorAll("[data-print-target], [data-print-status]")].length + (document.documentElement.hasAttribute("data-printing") ? 1 : 0);

afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ""; });

describe("printStatusLabel", () => {
  it("warns on a draft, including a document with no status", () => {
    expect(printStatusLabel(undefined)).toBe(draftLabel);
    expect(printStatusLabel("draft")).toBe(draftLabel);
  });
  it("names a reviewed or final document", () => {
    expect(printStatusLabel("reviewed")).toBe("Status: Ditinjau");
    expect(printStatusLabel("final")).toBe("Status: Final");
  });
});

describe("printDocument", () => {
  it("marks only the chosen element while printing", () => {
    document.body.innerHTML = `<article id="a"></article><article id="b"></article>`;
    const seen: Record<string, unknown> = {};
    vi.spyOn(window, "print").mockImplementation(() => {
      seen.printing = document.documentElement.hasAttribute("data-printing");
      seen.target = document.getElementById("a")?.hasAttribute("data-print-target");
      seen.status = document.getElementById("a")?.getAttribute("data-print-status");
      seen.sibling = document.getElementById("b")?.hasAttribute("data-print-target");
    });
    printDocument(document.getElementById("a"), "reviewed");
    expect(seen).toEqual({ printing: true, target: true, status: "Status: Ditinjau", sibling: false });
  });

  it("leaves no marker after printing", () => {
    document.body.innerHTML = `<article id="a"></article>`;
    vi.spyOn(window, "print").mockImplementation(() => { window.dispatchEvent(new Event("afterprint")); });
    printDocument(document.getElementById("a"), "draft");
    expect(markers()).toBe(0);
  });

  it("keeps the markers until afterprint when print() returns before the dialog closes (iOS)", () => {
    document.body.innerHTML = `<article id="a"></article>`;
    vi.spyOn(window, "print").mockImplementation(() => {});
    printDocument(document.getElementById("a"), "draft");
    expect(markers()).toBe(2);
    window.dispatchEvent(new Event("afterprint"));
    expect(markers()).toBe(0);
  });

  it("clears a previous document's markers when a second print starts first", () => {
    document.body.innerHTML = `<article id="a"></article><article id="b"></article>`;
    vi.spyOn(window, "print").mockImplementation(() => {});
    printDocument(document.getElementById("a"), "draft");
    printDocument(document.getElementById("b"), "final");
    expect(document.getElementById("a")?.hasAttribute("data-print-target")).toBe(false);
    expect(document.getElementById("b")?.getAttribute("data-print-status")).toBe("Status: Final");
    window.dispatchEvent(new Event("afterprint"));
    expect(markers()).toBe(0);
  });

  it("leaves no marker when printing fails, and the failure still surfaces", () => {
    document.body.innerHTML = `<article id="a"></article>`;
    vi.spyOn(window, "print").mockImplementation(() => { throw new Error("no printer"); });
    expect(() => printDocument(document.getElementById("a"), "draft")).toThrow("no printer");
    expect(markers()).toBe(0);
  });

  it("prints the page when there is no target", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => { expect(markers()).toBe(0); });
    printDocument(null, "draft");
    expect(print).toHaveBeenCalledTimes(1);
  });
});

describe("print stylesheet", () => {
  it("prints only the marked document with its status line", () => {
    const css = readFileSync(resolve(import.meta.dirname, "../../src/app/globals.css"), "utf8");
    expect(css).toContain("@media print");
    expect(css).toContain("[data-print-target]");
    expect(css).toContain("attr(data-print-status)");
  });
  it("lets every ancestor of the document grow, so a long document is not cut to one page", () => {
    // The workspace shell is 100dvh with hidden or clipped overflow; while printing, the target's ancestors must not clip it.
    const css = readFileSync(resolve(import.meta.dirname, "../../src/app/globals.css"), "utf8");
    const print = css.slice(css.lastIndexOf("@media print"));
    const rule = /html\[data-printing\] :has\(\[data-print-target\]\)\s*\{([^}]*)\}/.exec(print)?.[1] ?? "";
    for (const declaration of ["height: auto", "max-height: none", "overflow: visible"]) expect(rule).toContain(declaration);
  });
});
