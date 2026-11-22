// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { KnowledgeDialog } from "../../src/components/knowledge-dialog";

beforeEach(() => {
  // jsdom has neither matchMedia (the loader) nor modal dialogs; the catalogue search is not needed here.
  Object.defineProperty(window, "matchMedia", { writable: true, value: vi.fn().mockImplementation((query: string) => ({ matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })) });
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute("open"); });
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Pustaka Klinis review wording", () => {
  // Gaffer, 2026-11-22: the references were reviewed by a clinician (2026-10-23); the dialog must not also say they were not.
  it("says the references were reviewed by a clinician, and nowhere that they were not", () => {
    render(<KnowledgeDialog onClose={vi.fn()} onSave={vi.fn()}/>);
    const text = document.body.textContent ?? "";
    expect(text).toContain("ditinjau klinisi (2026-10-23)");
    expect(text).not.toContain("belum diverifikasi klinis");
    expect(screen.getByText(/Setiap baris dosis menyebut sumber dan halaman pedomannya/)).toBeTruthy();
  });
});
