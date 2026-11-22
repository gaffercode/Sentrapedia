// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { emptyCase, type AadiResult } from "../../src/lib/aadi/contract";

// The analysis call is replaced: the form's own behaviour around the result is what is tested.
const result = { contractVersion: "1", status: "ok", differential: { likely: [{ icd10: "A90", label: "Demam sintetis", confidenceTier: "low" }], alternatives: [], cannotMiss: [] }, evidence: [], missingInformation: [], nextBestActions: [], disposition: null, unfilled: [], meta: { version: "test", model: "mock", costUsd: null } } satisfies AadiResult;
vi.mock("../../src/lib/aadi/client", () => ({ requestAadiAnalysis: vi.fn(async (caseData: unknown) => ({ case: caseData, result, traceId: "0f8fad5b-d9cb-469f-a165-70867728950e", createdAt: "2026-11-22T00:00:00Z" })) }));
import { AadiCaseForm } from "../../src/components/aadi-case-form";

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", { writable: true, value: vi.fn().mockImplementation((query: string) => ({ matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })) });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ reachable: true, configured: true, modelReady: true, groundingReady: true }))));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Analisis kasus result after the case changes (Gaffer, 2026-11-22: mark it stale)", () => {
  it("keeps the result, marks it kedaluwarsa, still saves it, and clears the mark on a new analysis", async () => {
    const onSave = vi.fn();
    render(<AadiCaseForm onSave={onSave}/>);
    fireEvent.change(screen.getByRole("textbox", { name: "Keluhan utama kasus" }), { target: { value: "Demam" } });
    const run = await screen.findByRole("button", { name: "Analisis kasus" });
    await vi.waitFor(() => expect((run as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(run);
    expect(await screen.findByText(/Hasil analisis/)).toBeTruthy();
    expect(screen.queryByText(/kedaluwarsa/i)).toBeNull();

    fireEvent.change(screen.getByRole("spinbutton", { name: "Usia kasus" }), { target: { value: "40" } });
    expect(screen.getByText(/Hasil analisis/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Hasil analisis · kedaluwarsa" })).toBeTruthy();
    expect(screen.getByText(/^Kedaluwarsa: data kasus diubah/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Simpan sebagai draf untuk ditinjau" }));
    // The saved draft is the analysis as run, with the case it was run on.
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ case: expect.objectContaining({ ...emptyCase(), chiefComplaint: "Demam" }) }));

    fireEvent.click(screen.getByRole("button", { name: "Analisis kasus" }));
    expect(await screen.findByRole("heading", { name: "Hasil analisis · belum ditinjau" })).toBeTruthy();
    expect(screen.queryByText(/^Kedaluwarsa: data kasus diubah/)).toBeNull();
  });
});
