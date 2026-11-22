// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ContextForm, ListForm, PatientForm } from "../../src/components/forms";
import { initialWorkspace } from "../../src/lib/workspace";

beforeEach(() => {
  // jsdom has neither matchMedia (the loader) nor modal dialogs.
  Object.defineProperty(window, "matchMedia", { writable: true, value: vi.fn().mockImplementation((query: string) => ({ matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })) });
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute("open"); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("PatientForm age", () => {
  it("refuses an age outside 0 to 130 and says why", () => {
    const onSave = vi.fn();
    render(<PatientForm onSave={onSave} onDelete={vi.fn()} onClose={vi.fn()}/>);
    fireEvent.change(screen.getByPlaceholderText("Contoh: Pasien Demo"), { target: { value: "Pasien Uji" } });
    const age = screen.getByPlaceholderText("Tahun");
    fireEvent.change(age, { target: { value: "999" } });
    fireEvent.click(screen.getByRole("button", { name: "Buat Pasien" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Isi usia 0 sampai 130 tahun.")).toBeTruthy();
    expect(age.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(age, { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "Buat Pasien" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: "Pasien Uji", age: "45" }));
  });

  it("still saves a patient with no age", () => {
    const onSave = vi.fn();
    render(<PatientForm onSave={onSave} onDelete={vi.fn()} onClose={vi.fn()}/>);
    fireEvent.change(screen.getByPlaceholderText("Contoh: Pasien Demo"), { target: { value: "Pasien Uji" } });
    fireEvent.click(screen.getByRole("button", { name: "Buat Pasien" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ age: "" }));
  });
});

describe("PatientForm age, review cases", () => {
  it("refuses text the browser could not read as a number, which leaves the value empty", () => {
    const onSave = vi.fn();
    render(<PatientForm onSave={onSave} onDelete={vi.fn()} onClose={vi.fn()}/>);
    fireEvent.change(screen.getByPlaceholderText("Contoh: Pasien Demo"), { target: { value: "Pasien Uji" } });
    const age = screen.getByPlaceholderText("Tahun") as HTMLInputElement;
    Object.defineProperty(age, "validity", { configurable: true, get: () => ({ badInput: true }) });
    fireEvent.click(screen.getByRole("button", { name: "Buat Pasien" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Isi usia 0 sampai 130 tahun.")).toBeTruthy();
  });

  it("still saves a stored patient whose old age is not a whole number, when the age is not touched", () => {
    const onSave = vi.fn();
    render(<PatientForm patient={{ id: "p1", name: "Pasien Lama", age: "6 bulan", sex: "Not specified", notes: "" }} onSave={onSave} onDelete={vi.fn()} onClose={vi.fn()}/>);
    fireEvent.change(screen.getByPlaceholderText(/History, Medications/), { target: { value: "Catatan baru." } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ age: "6 bulan", notes: "Catatan baru." }));
  });
});

describe("ListForm delete", () => {
  it("asks before deleting a list, like Pasien and Encounter", () => {
    const dispatch = vi.fn();
    const list = { id: "l1", name: "Daftar uji", patientIds: [] };
    render(<ListForm list={list} state={{ ...initialWorkspace, lists: [list] }} dispatch={dispatch} onClose={vi.fn()}/>);
    fireEvent.click(screen.getByRole("button", { name: "Hapus daftar" }));
    expect(dispatch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Ya, hapus daftar" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "list.delete", id: "l1" });
  });
});

describe("ContextForm file", () => {
  it("reads the same file again after the box was cleared", async () => {
    render(<ContextForm context="" onSave={vi.fn()} onClose={vi.fn()}/>);
    const input = screen.getByLabelText("Unggah berkas konteks") as HTMLInputElement;
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    // jsdom cannot hold a file path in the value, so the value is stubbed: a browser sends no change event when the chosen
    // file is the one already in the value, so the form must clear it after each read.
    let value = "C:\\fakepath\\konteks.txt";
    Object.defineProperty(input, "value", { configurable: true, get: () => value, set: (next: string) => { value = next; } });
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["Riwayat: hipertensi."], "konteks.txt", { type: "text/plain" })] });
    fireEvent.change(input);
    await waitFor(() => expect(box.value).toBe("Riwayat: hipertensi."));
    expect(value).toBe("");
  });
});
