// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useCallback, useState } from "react";
import { initialWorkspace, workspaceReducer, type Workspace, type WorkspaceAction } from "../../src/lib/workspace";
import { useWorkspacePersistence } from "../../src/components/workspace-hooks";

// In the browser the restored workspace can reach the page one render after `restoring` turns false (seen on /agent:
// verify-report/functional/g9.log). The hook must not save the default workspace over the stored one in that render.
const keys = { storageKey: "sentrapedia-workspace-v2:test", unreadableKey: "sentrapedia-workspace-v2:test:unreadable" };
const stored: Workspace = { ...initialWorkspace, patients: [{ id: "p1", name: "Pasien Tersimpan", age: "", sex: "", notes: "" }] };
const notify = () => undefined;
let late: (() => void)[] = [];

// Applies `restore` only when the test releases it, which is the order the browser was seen to produce.
function Harness() {
  const [state, setState] = useState(initialWorkspace);
  const dispatch = useCallback((action: WorkspaceAction) => {
    const apply = () => setState(current => workspaceReducer(current, action));
    if (action.type === "restore") late.push(apply); else apply();
  }, []);
  const { restoring } = useWorkspacePersistence(state, dispatch, notify, keys);
  return <><p>{restoring ? "Membuka…" : `Pasien: ${state.patients.map(p => p.name).join(", ")}`}</p><button onClick={() => dispatch({ type: "settings.save", settings: { ...state.settings, instructions: "Kalimat ringkas." } })}>Ubah</button></>;
}
const saved = () => localStorage.getItem(keys.storageKey) ?? "";

beforeEach(() => { localStorage.clear(); late = []; localStorage.setItem(keys.storageKey, JSON.stringify(stored)); });
afterEach(cleanup);

describe("restoring the stored workspace", () => {
  it("does not write the default workspace over the stored one before the restored state is rendered", async () => {
    render(<Harness/>);
    expect(await screen.findByText("Pasien: Pasien")).toBeTruthy();
    expect(saved()).toContain("Pasien Tersimpan");
    act(() => { late.forEach(apply => apply()); });
    expect(screen.getByText("Pasien: Pasien Tersimpan")).toBeTruthy();
    expect(saved()).toContain("Pasien Tersimpan");
  });

  // An action reduced in the same render as the restore must not stop saving for the rest of the session.
  it("saves an edit that lands in the same render as the restored state", async () => {
    render(<Harness/>);
    expect(await screen.findByText("Pasien: Pasien")).toBeTruthy();
    act(() => { late.forEach(apply => apply()); fireEvent.click(screen.getByRole("button", { name: "Ubah" })); });
    expect(screen.getByText("Pasien: Pasien Tersimpan")).toBeTruthy();
    expect(saved()).toContain("Pasien Tersimpan");
    expect(saved()).toContain("Kalimat ringkas.");
  });

  it("saves an edit made after the restored state is rendered", async () => {
    function Editing() {
      const [state, setState] = useState(initialWorkspace);
      const dispatch = useCallback((action: WorkspaceAction) => setState(current => workspaceReducer(current, action)), []);
      const { restoring } = useWorkspacePersistence(state, dispatch, notify, keys);
      return <><p>{restoring ? "Membuka…" : state.settings.instructions || "kosong"}</p><button onClick={() => dispatch({ type: "settings.save", settings: { ...state.settings, instructions: "Kalimat ringkas." } })}>Ubah</button></>;
    }
    render(<Editing/>);
    expect(await screen.findByText("kosong")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ubah" }));
    expect(screen.getByText("Kalimat ringkas.")).toBeTruthy();
    expect(saved()).toContain("Kalimat ringkas.");
    expect(saved()).toContain("Pasien Tersimpan");
  });
});
