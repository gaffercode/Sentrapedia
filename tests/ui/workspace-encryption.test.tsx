// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useReducer } from "react";
import { initialWorkspace, workspaceReducer, type Workspace } from "../../src/lib/workspace";
import { createLock, isEnvelope, openWorkspace, sealWorkspace } from "../../src/lib/workspace-crypto";
import { useWorkspacePersistence } from "../../src/components/workspace-hooks";
import { WorkspaceUnlock } from "../../src/components/workspace-unlock";
import { AccountDialog } from "../../src/components/workspace-dialogs";

// The passphrase-encrypted workspace in the browser (docs/specs/2026-11-19-workspace-encryption-design.md, D1 to D6).
const keys = { storageKey: "sentrapedia-workspace-v2:test", unreadableKey: "sentrapedia-workspace-v2:test:unreadable" };
const named: Workspace = { ...initialWorkspace, patients: [{ id: "p1", name: "Pasien Rahasia", age: "", sex: "", notes: "" }] };
const passphrase = "passphrase-uji-1";
let api: ReturnType<typeof useWorkspacePersistence> | null = null;
// Stable, like useToast's notify: a new function each render would re-run the restore effect.
const notify = () => undefined;
const expose = (value: ReturnType<typeof useWorkspacePersistence>) => { api = value; };

function Harness() {
  const [state, dispatch] = useReducer(workspaceReducer, initialWorkspace);
  const persistence = useWorkspacePersistence(state, dispatch, notify, keys);
  useEffect(() => { expose(persistence); });
  if (persistence.restoring) return <p>Membuka…</p>;
  if (persistence.locked) return <WorkspaceUnlock onUnlock={persistence.unlock} onForget={persistence.forget}/>;
  return <><p>{state.patients.map(p => p.name).join(", ")}</p><button onClick={() => dispatch({ type: "settings.save", settings: { ...state.settings, instructions: `${state.settings.instructions}x` } })}>Ubah</button></>;
}
const saved = () => localStorage.getItem(keys.storageKey);

beforeEach(() => {
  localStorage.clear();
  // jsdom has neither matchMedia (the loader) nor modal dialogs.
  Object.defineProperty(window, "matchMedia", { writable: true, value: vi.fn().mockImplementation((query: string) => ({ matches: query.includes("reduce"), media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })) });
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute("open"); });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); api = null; });

describe("unlock screen", () => {
  it("shows only the unlock screen while the workspace is encrypted", async () => {
    localStorage.setItem(keys.storageKey, await sealWorkspace(await createLock(passphrase, 100_000), JSON.stringify(named)));
    render(<Harness/>);
    expect(await screen.findByRole("heading", { name: "Workspace terkunci" })).toBeTruthy();
    expect(screen.queryByText(/Pasien Rahasia/)).toBeNull();
  });
  it("refuses a wrong passphrase without touching storage, and opens with the right one", async () => {
    const sealed = await sealWorkspace(await createLock(passphrase, 100_000), JSON.stringify(named));
    localStorage.setItem(keys.storageKey, sealed);
    render(<Harness/>);
    fireEvent.change(await screen.findByLabelText("Passphrase"), { target: { value: "passphrase-salah" } });
    fireEvent.click(screen.getByRole("button", { name: "Buka workspace" }));
    expect(await screen.findByText("Passphrase salah.")).toBeTruthy();
    expect(saved()).toBe(sealed);
    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: passphrase } });
    fireEvent.click(screen.getByRole("button", { name: "Buka workspace" }));
    expect(await screen.findByText("Pasien Rahasia")).toBeTruthy();
    await waitFor(() => expect(saved()).not.toBe(sealed));
    expect(isEnvelope(saved())).toBe(true);
  });
  it("offers no removal while an unlock is running", async () => {
    let finish: (value: string | null) => void = () => undefined;
    const onForget = vi.fn();
    render(<WorkspaceUnlock onUnlock={() => new Promise(resolve => { finish = resolve; })} onForget={onForget}/>);
    fireEvent.click(screen.getByRole("button", { name: "Hapus workspace terenkripsi" }));
    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: passphrase } });
    fireEvent.click(screen.getByRole("button", { name: "Buka workspace" }));
    const remove = screen.getByRole("button", { name: "Hapus permanen" }) as HTMLButtonElement;
    expect(remove.disabled).toBe(true);
    fireEvent.click(remove);
    expect(onForget).not.toHaveBeenCalled();
    await act(async () => { finish("Passphrase salah."); });
    expect((screen.getByRole("button", { name: "Hapus permanen" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("removes the encrypted workspace only after an explicit confirmation", async () => {
    localStorage.setItem(keys.storageKey, await sealWorkspace(await createLock(passphrase, 100_000), JSON.stringify(named)));
    render(<Harness/>);
    fireEvent.click(await screen.findByRole("button", { name: "Hapus workspace terenkripsi" }));
    expect(isEnvelope(saved())).toBe(true);
    expect(screen.getByText(/tidak dapat dibatalkan/)).toBeTruthy();
    vi.stubGlobal("location", { ...window.location, reload: vi.fn() });
    fireEvent.click(screen.getByRole("button", { name: "Hapus permanen" }));
    expect(saved()).toBeNull();
  });
});

describe("turning encryption on and off", () => {
  it("encrypts storage on enable, writes plain JSON on disable, and locks on demand", async () => {
    localStorage.setItem(keys.storageKey, JSON.stringify(named));
    render(<Harness/>);
    await screen.findByText("Pasien Rahasia");
    await act(() => api!.encryption.enable(passphrase));
    await waitFor(() => expect(isEnvelope(saved())).toBe(true));
    expect(saved()).not.toContain("Pasien Rahasia");
    act(() => api!.encryption.disable());
    await waitFor(() => expect(saved()).toContain("Pasien Rahasia"));
    await act(() => api!.encryption.enable(passphrase));
    await waitFor(() => expect(isEnvelope(saved())).toBe(true));
    await act(() => api!.encryption.lockNow());
    expect(await screen.findByRole("heading", { name: "Workspace terkunci" })).toBeTruthy();
    expect(screen.queryByText(/Pasien Rahasia/)).toBeNull();
  });
  it("keeps an edit made while locking waits for the save before it", async () => {
    localStorage.setItem(keys.storageKey, JSON.stringify(named));
    render(<Harness/>);
    await screen.findByText("Pasien Rahasia");
    await act(() => api!.encryption.enable(passphrase));
    await waitFor(() => expect(isEnvelope(saved())).toBe(true));
    const before = JSON.parse((await openWorkspace(passphrase, saved()!)).plaintext).settings.instructions as string;
    fireEvent.click(screen.getByRole("button", { name: "Ubah" }));
    let locking: Promise<void> = Promise.resolve();
    act(() => { locking = api!.encryption.lockNow(); });
    fireEvent.click(screen.getByRole("button", { name: "Ubah" }));
    await act(() => locking);
    expect(await screen.findByRole("heading", { name: "Workspace terkunci" })).toBeTruthy();
    expect(JSON.parse((await openWorkspace(passphrase, saved()!)).plaintext).settings.instructions).toBe(`${before}xx`);
  });
  it("locks after 30 minutes without input (D5)", async () => {
    localStorage.setItem(keys.storageKey, JSON.stringify(named));
    render(<Harness/>);
    await screen.findByText("Pasien Rahasia");
    await act(() => api!.encryption.enable(passphrase));
    await waitFor(() => expect(isEnvelope(saved())).toBe(true));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fireEvent.keyDown(window, { key: "a" });
    await act(async () => { vi.advanceTimersByTime(29 * 60_000); });
    expect(screen.queryByRole("heading", { name: "Workspace terkunci" })).toBeNull();
    await act(async () => { vi.advanceTimersByTime(60_000 + 1); });
    vi.useRealTimers();
    expect(await screen.findByRole("heading", { name: "Workspace terkunci" })).toBeTruthy();
  });
});

describe("final review fixes", () => {
  it("refuses to enable when the saved workspace is unreadable, and leaves storage as it was", async () => {
    localStorage.setItem(keys.storageKey, "bukan workspace");
    render(<Harness/>);
    await waitFor(() => expect(api?.restoring).toBe(false));
    await expect(act(() => api!.encryption.enable(passphrase))).rejects.toThrow();
    expect(api!.encryption.enabled).toBe(false);
    expect(saved()).toBe("bukan workspace");
  });
  it("refuses to enable when the envelope does not fit, and keeps the plain workspace", async () => {
    localStorage.setItem(keys.storageKey, JSON.stringify(named));
    render(<Harness/>);
    await screen.findByText("Pasien Rahasia");
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) { if (isEnvelope(value)) throw new DOMException("full", "QuotaExceededError"); setItem.call(this, key, value); });
    await expect(act(() => api!.encryption.enable(passphrase))).rejects.toThrow(/terlalu besar/);
    expect(api!.encryption.enabled).toBe(false);
    expect(saved()).toContain("Pasien Rahasia");
  });
  it("locks instead of writing plain JSON once another tab encrypted the workspace", async () => {
    localStorage.setItem(keys.storageKey, JSON.stringify(named));
    render(<Harness/>);
    await screen.findByText("Pasien Rahasia");
    const sealed = await sealWorkspace(await createLock(passphrase, 100_000), JSON.stringify(named));
    localStorage.setItem(keys.storageKey, sealed);
    fireEvent.click(screen.getByRole("button", { name: "Ubah" }));
    expect(await screen.findByRole("heading", { name: "Workspace terkunci" })).toBeTruthy();
    expect(saved()).toBe(sealed);
  });
  it("locks when another tab's storage event brings an envelope", async () => {
    localStorage.setItem(keys.storageKey, JSON.stringify(named));
    render(<Harness/>);
    await screen.findByText("Pasien Rahasia");
    const sealed = await sealWorkspace(await createLock(passphrase, 100_000), JSON.stringify(named));
    localStorage.setItem(keys.storageKey, sealed);
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: keys.storageKey, newValue: sealed })); });
    expect(await screen.findByRole("heading", { name: "Workspace terkunci" })).toBeTruthy();
    expect(screen.queryByText(/Pasien Rahasia/)).toBeNull();
  });
  it("reloads the page after removing a forgotten workspace, so nothing of the previous session stays on screen", async () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    localStorage.setItem(keys.storageKey, await sealWorkspace(await createLock(passphrase, 100_000), JSON.stringify(named)));
    render(<Harness/>);
    fireEvent.click(await screen.findByRole("button", { name: "Hapus workspace terenkripsi" }));
    fireEvent.click(screen.getByRole("button", { name: "Hapus permanen" }));
    expect(saved()).toBeNull();
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it("shows why enabling failed", async () => {
    const enable = vi.fn(async () => { throw new Error("Workspace terlalu besar untuk dienkripsi di browser ini."); });
    URL.createObjectURL = vi.fn(() => "blob:x"); URL.revokeObjectURL = vi.fn();
    render(<AccountDialog state={named} unreadable={null} onRestore={() => undefined} onClear={() => undefined} onInvalidImport={() => undefined} onPush={() => undefined} onPull={() => undefined} syncBusy={false} onClose={() => undefined} encryption={{ enabled: false, enable, disable: () => undefined, lockNow: async () => undefined }}/>);
    fireEvent.click(screen.getByRole("button", { name: "Unduh backup dulu" }));
    fireEvent.change(screen.getByLabelText("Passphrase baru"), { target: { value: passphrase } });
    fireEvent.change(screen.getByLabelText("Ulangi passphrase"), { target: { value: passphrase } });
    fireEvent.click(screen.getByRole("button", { name: "Aktifkan enkripsi" }));
    expect((await screen.findByRole("alert")).textContent).toContain("terlalu besar");
  });
});

describe("account dialog", () => {
  const props = { state: named, unreadable: null, onRestore: () => undefined, onClear: () => undefined, onInvalidImport: () => undefined, onPush: () => undefined, onPull: () => undefined, syncBusy: false, onClose: () => undefined };
  beforeEach(() => { URL.createObjectURL = vi.fn(() => "blob:x"); URL.revokeObjectURL = vi.fn(); });
  it("enables encryption only after a backup download and two matching passphrases (D2)", async () => {
    const enable = vi.fn(async () => undefined);
    render(<AccountDialog {...props} encryption={{ enabled: false, enable, disable: () => undefined, lockNow: async () => undefined }}/>);
    expect(screen.getByText(/tidak dapat dipulihkan/)).toBeTruthy();
    const button = screen.getByRole("button", { name: "Aktifkan enkripsi" }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText("Passphrase baru"), { target: { value: passphrase } });
    fireEvent.change(screen.getByLabelText("Ulangi passphrase"), { target: { value: passphrase } });
    expect(button.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Unduh backup dulu" }));
    expect(button.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("Ulangi passphrase"), { target: { value: "lain-sekali-123" } });
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Passphrase baru"), { target: { value: "pendek" } });
    fireEvent.change(screen.getByLabelText("Ulangi passphrase"), { target: { value: "pendek" } });
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Passphrase baru"), { target: { value: passphrase } });
    fireEvent.change(screen.getByLabelText("Ulangi passphrase"), { target: { value: passphrase } });
    fireEvent.click(button);
    await waitFor(() => expect(enable).toHaveBeenCalledWith(passphrase));
  });
  it("warns that the export is not encrypted while encryption is on (D3)", () => {
    render(<AccountDialog {...props} encryption={{ enabled: true, enable: async () => undefined, disable: () => undefined, lockNow: async () => undefined }}/>);
    expect(screen.getByText(/Browser menyimpan workspace di perangkat ini terenkripsi dengan passphrase./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Ekspor backup/ }));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(screen.getByText("File ini tidak terenkripsi. Simpan di tempat aman.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tetap ekspor" }));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Kunci sekarang" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Matikan enkripsi" })).toBeTruthy();
  });
});
