"use client";

import { useState } from "react";
import { PixelLoader } from "./pixel-loader";

// The encrypted workspace stays closed until its passphrase is given (docs/specs/2026-11-19-workspace-encryption-design.md).
// Nothing of the workspace renders here. A forgotten passphrase cannot be recovered (D2), so the only way on is to remove
// the encrypted copy after an explicit confirmation, and never while an unlock is running.
export function WorkspaceUnlock({ onUnlock, onForget }: { onUnlock: (passphrase: string) => Promise<string | null>; onForget: () => void }) {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);
  async function submit() {
    if (busy || !passphrase) return;
    setBusy(true); setError("");
    const failure = await onUnlock(passphrase);
    setBusy(false);
    if (failure) setError(failure);
  }
  return <main className="system-loading workspace-unlock">
    <h1>Workspace terkunci</h1>
    <p>Masukkan passphrase untuk membuka workspace di browser ini.</p>
    <form className="workflow-form" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <label>Passphrase<input type="password" autoComplete="current-password" autoFocus value={passphrase} disabled={busy} onChange={e => setPassphrase(e.target.value)}/></label>
      <button className="button primary" disabled={busy || !passphrase}>Buka workspace</button>
      {busy && <PixelLoader label="Membuka workspace…"/>}
    </form>
    {error && <p className="form-warning" role="alert">{error}</p>}
    <p className="panel-caption">Lupa passphrase? Workspace terenkripsi tidak dapat dipulihkan.</p>
    {confirmForget
      ? <div className="form-warning"><p>Hapus permanen workspace terenkripsi di browser ini? Tindakan ini tidak dapat dibatalkan.</p><button type="button" className="button danger" disabled={busy} onClick={onForget}>Hapus permanen</button><button type="button" className="button" onClick={() => setConfirmForget(false)}>Batal</button></div>
      : <button type="button" className="button danger-ghost" disabled={busy} onClick={() => setConfirmForget(true)}>Hapus workspace terenkripsi</button>}
  </main>;
}
