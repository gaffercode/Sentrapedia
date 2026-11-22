// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AgentSettings } from "../../src/components/agent-settings";
import { useReducer } from "react";
import { initialWorkspace, workspaceReducer } from "../../src/lib/workspace";

afterEach(cleanup);
const theoracle = { id: "TheOracle", chunks: 17989, model: "onnx-community/embeddinggemma-300m-ONNX", hash: "a".repeat(64), catalogVersion: "0.6" };

describe("AgentSettings", () => {
  it("has three tabs and saves environment from Preferensi", () => {
    const dispatch = vi.fn();
    render(<AgentSettings state={initialWorkspace} dispatch={dispatch} theoracle={theoracle}/>);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Preferensi", "Mode dan templat", "Pengetahuan"]);
    expect(screen.getByRole("tab", { name: "Preferensi" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.change(screen.getByLabelText("Lingkungan"), { target: { value: "Rawat jalan" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan preferensi" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "settings.save", settings: { ...initialWorkspace.settings, environment: "Rawat jalan" } });
    expect(screen.getByRole("status").textContent).toBe("Preferensi Agent tersimpan.");
  });

  // In the browser the page mounts this form one render before the stored workspace is restored.
  it("follows the settings when the stored workspace arrives after the form mounted, and saves those", () => {
    const dispatch = vi.fn();
    const restored = { ...initialWorkspace, settings: { ...initialWorkspace.settings, name: "dr. Rani Uji", specialty: "Emergency Medicine", language: "English" as const } };
    const { rerender } = render(<AgentSettings state={initialWorkspace} dispatch={dispatch} theoracle={theoracle}/>);
    rerender(<AgentSettings state={restored} dispatch={dispatch} theoracle={theoracle}/>);
    expect((screen.getByLabelText("Nama panggilan") as HTMLInputElement).value).toBe("dr. Rani Uji");
    expect((screen.getByLabelText("Specialty") as HTMLSelectElement).value).toBe("Emergency Medicine");
    expect((screen.getByLabelText("Bahasa draf") as HTMLSelectElement).value).toBe("English");
    fireEvent.click(screen.getByRole("button", { name: "Simpan preferensi" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "settings.save", settings: restored.settings });
  });

  it("keeps an unsaved edit when the workspace changes somewhere other than its settings", () => {
    const { rerender } = render(<AgentSettings state={initialWorkspace} dispatch={vi.fn()} theoracle={theoracle}/>);
    fireEvent.change(screen.getByLabelText("Nama panggilan"), { target: { value: "dr. Belum Simpan" } });
    rerender(<AgentSettings state={{ ...initialWorkspace, favorites: ["clinic"] }} dispatch={vi.fn()} theoracle={theoracle}/>);
    expect((screen.getByLabelText("Nama panggilan") as HTMLInputElement).value).toBe("dr. Belum Simpan");
  });

  it("each tab's save button saves only that tab, and keeps the other tab's unsaved edits", () => {
    const dispatch = vi.fn();
    // The page's reducer, so a save reaches `state` as it does on /agent.
    function Page() { const [state, apply] = useReducer(workspaceReducer, initialWorkspace); return <AgentSettings state={state} dispatch={(action) => { dispatch(action); apply(action); }} theoracle={theoracle}/>; }
    render(<Page/>);
    fireEvent.change(screen.getByLabelText("Nama panggilan"), { target: { value: "dr. Belum Simpan" } });
    fireEvent.click(screen.getByRole("tab", { name: "Mode dan templat" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Instruksi mode Catatan Klinis (SOAP)" }), { target: { value: "Singkat." } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan instruksi mode" }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: "settings.save", settings: { ...initialWorkspace.settings, modeInstructions: { clinic: "Singkat." } } });
    fireEvent.click(screen.getByRole("tab", { name: "Preferensi" }));
    expect((screen.getByLabelText("Nama panggilan") as HTMLInputElement).value).toBe("dr. Belum Simpan");
  });

  it("does not report unsaved edits after an edit is undone", () => {
    const onUnsaved = vi.fn();
    const state = { ...initialWorkspace, settings: { ...initialWorkspace.settings, modeInstructions: { clinic: "A.", ed: "B." } } };
    render(<AgentSettings state={state} dispatch={vi.fn()} theoracle={theoracle} onUnsaved={onUnsaved}/>);
    fireEvent.change(screen.getByLabelText("Nama panggilan"), { target: { value: "x" } });
    fireEvent.change(screen.getByLabelText("Nama panggilan"), { target: { value: "" } });
    expect(onUnsaved).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole("tab", { name: "Mode dan templat" }));
    const clinic = screen.getByRole("textbox", { name: "Instruksi mode Catatan Klinis (SOAP)" });
    fireEvent.change(clinic, { target: { value: "" } });
    fireEvent.change(clinic, { target: { value: "A." } });
    expect(onUnsaved).toHaveBeenLastCalledWith(false);
  });

  it("binds a textarea per mode to modeInstructions and keeps the template manager on the same tab", () => {
    const dispatch = vi.fn();
    render(<AgentSettings state={initialWorkspace} dispatch={dispatch} theoracle={theoracle}/>);
    fireEvent.click(screen.getByRole("tab", { name: "Mode dan templat" }));
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getAllByRole("textbox", { name: /^Instruksi mode / })).toHaveLength(18);
    fireEvent.change(within(panel).getByRole("textbox", { name: "Instruksi mode Catatan Klinis (SOAP)" }), { target: { value: "Pakai bahasa singkat." } });
    fireEvent.click(within(panel).getByRole("button", { name: "Simpan instruksi mode" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "settings.save", settings: { ...initialWorkspace.settings, modeInstructions: { clinic: "Pakai bahasa singkat." } } });
    expect(within(panel).getByRole("group", { name: "Pengelola templat" })).toBeTruthy();
    // The page has no composer: the template manager keeps favourites and editing, not "Gunakan".
    expect(within(panel).queryByRole("button", { name: "Gunakan" })).toBeNull();
  });

  it("Pengetahuan lists the installed index, or says the database is not installed", () => {
    const { unmount } = render(<AgentSettings state={initialWorkspace} dispatch={vi.fn()} theoracle={theoracle}/>);
    fireEvent.click(screen.getByRole("tab", { name: "Pengetahuan" }));
    expect(screen.getByText("17.989")).toBeTruthy();
    expect(screen.getByText("onnx-community/embeddinggemma-300m-ONNX")).toBeTruthy();
    expect(screen.getByText("a".repeat(64))).toBeTruthy();
    expect(screen.getByText("0.6")).toBeTruthy();
    unmount();
    render(<AgentSettings state={initialWorkspace} dispatch={vi.fn()} theoracle={null}/>);
    fireEvent.click(screen.getByRole("tab", { name: "Pengetahuan" }));
    expect(screen.getByText("Database belum terpasang")).toBeTruthy();
  });
});
