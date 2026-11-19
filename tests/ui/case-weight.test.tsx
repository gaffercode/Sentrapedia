// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AadiCaseForm } from "../../src/components/aadi-case-form";
import { emptyCase, validCase, type AadiResult } from "../../src/lib/aadi/contract";
import { aadiDraft, referralSectionTitle } from "../../src/lib/aadi/presentation";
import { documentSections } from "../../src/lib/studio";

afterEach(cleanup);

// Body weight is input only (docs/FEATURE-IDEAS.md idea 5): the case carries it to the model and the draft names it;
// nothing computes a dose from it.
const withWeight = (weightKg: unknown) => ({ ...emptyCase(), chiefComplaint: "Demam", demographics: { ageYears: 4, sex: "M" as const, weightKg } });
const result = { contractVersion: "1", status: "ok", differential: { likely: [{ icd10: "A90", label: "Demam sintetis", confidenceTier: "low" }], alternatives: [], cannotMiss: [] }, evidence: [], missingInformation: [], nextBestActions: [], disposition: null, unfilled: [], meta: { version: "test", model: "mock", costUsd: null } } satisfies AadiResult;
const referral = (caseData: ReturnType<typeof emptyCase>) => documentSections(aadiDraft(result, "t", "2026-11-19T00:00:00Z", caseData, "refer")).find(s => s.title === referralSectionTitle)!.body;

describe("body weight in the case", () => {
  it("accepts a plausible weight and refuses an implausible one", () => {
    expect(validCase(withWeight(12.5))).toBe(true);
    for (const weight of [0, -1, 401, "60"]) expect(validCase(withWeight(weight))).toBe(false);
  });
  it("keeps a case without weight valid", () => {
    expect(validCase({ ...emptyCase(), chiefComplaint: "Demam" })).toBe(true);
  });
  it("names the weight in the draft's patient line, and reads as before without it", () => {
    // Only the patient line: the catalogue's referral text for a real code may mention weight in its own words.
    // field() writes the label on its own line and the value below it.
    const patient = (body: string) => { const lines = body.split(/\n/); return lines[lines.findIndex(line => line.includes("Pasien")) + 1] ?? ""; };
    expect(patient(referral(withWeight(12.5) as ReturnType<typeof emptyCase>))).toContain("4 tahun · Laki-laki · Berat badan 12.5 kg");
    expect(patient(referral({ ...emptyCase(), chiefComplaint: "Demam", demographics: { ageYears: 4, sex: "M" } }))).not.toContain("Berat badan");
  });
  it("offers a number input labelled Berat badan (kg)", () => {
    render(<AadiCaseForm onSave={() => undefined}/>);
    const input = screen.getByRole("spinbutton", { name: "Berat badan kasus" }) as HTMLInputElement;
    expect(input.closest("label")?.textContent).toContain("Berat badan (kg)");
    expect([input.min, input.max]).toEqual(["0.3", "400"]);
    fireEvent.change(input, { target: { value: "12.5" } });
    expect(input.value).toBe("12.5");
  });
});
