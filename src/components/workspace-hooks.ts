"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type Dispatch } from "react";
import { initialWorkspace, type Workspace, type WorkspaceAction } from "../lib/workspace";
import type { WorkspaceStorageKeys } from "../lib/workspace-storage";
import { restoreEncrypted, restoreFromStorage } from "../lib/workspace-session";
import { saveEncryptedWorkspace, saveLocalWorkspace } from "../lib/workflow";
import { createLock, isEnvelope, openWorkspace, sealWorkspace, WrongPassphrase, type WorkspaceLock } from "../lib/workspace-crypto";
import { smooth } from "./smooth";

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((callback: () => void) => { const media = window.matchMedia(query); media.addEventListener("change", callback); return () => media.removeEventListener("change", callback); }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

export function useToast() {
  const [toast, setToast] = useState("");
  const [toastError, setToastError] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((text: string, tone?: "error") => { if (toastTimer.current) clearTimeout(toastTimer.current); setToast(text); setToastError(tone === "error"); toastTimer.current = setTimeout(() => smooth(() => setToast("")), 4500); }, []);
  const dismiss = useCallback(() => { if (toastTimer.current) clearTimeout(toastTimer.current); smooth(() => setToast("")); }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  return { toast, toastError, notify, dismiss };
}

/** D5: an unlocked encrypted workspace locks after 30 minutes without input. */
export const idleLockMs = 30 * 60_000;
const conflictMessage = "Workspace berubah di tab lain. Perubahan di tab ini belum tersimpan. Ekspor backup dari profil workspace sebelum memuat ulang.";
class WorkspaceChanged extends Error {}

async function withStorageLock(key: string, work: () => void | Promise<void>): Promise<void> {
  if (navigator.locks) await navigator.locks.request(key, work);
  else await work();
}

const inputEvents = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

// Restore and save stay in one hook so the restore effect always runs before the first save. An encrypted workspace
// (docs/specs/2026-11-19-workspace-encryption-design.md) stays locked until unlock(); its key lives in memory only.
export function useWorkspacePersistence(state: Workspace, dispatch: Dispatch<WorkspaceAction>, notify: (text: string, tone?: "error") => void, keys: WorkspaceStorageKeys) {
  const [storageError, setStorageError] = useState("");
  // Saved text that failed validation at load; kept (memory and unreadableKey) so it can be downloaded instead of lost.
  const [unreadable, setUnreadable] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [locked, setLocked] = useState(false);
  const [encrypted, setEncrypted] = useState(false);
  const writable = useRef(false);
  const lastStored = useRef<string | null>(null);
  const lastSaved = useRef<Workspace | null>(null);
  const lock = useRef<WorkspaceLock | null>(null);
  // Every save takes a number; an encrypted save writes only if no newer save started while it was sealing.
  const saveSeq = useRef(0);
  const pendingSave = useRef<Promise<unknown>>(Promise.resolve());
  const latest = useRef(state);
  useEffect(() => { latest.current = state; });
  // The state a restore is replacing, until a render holds anything else. Nothing is saved while it is still the state:
  // that render would write the default workspace over the stored one.
  const stale = useRef<Workspace | null>(null);
  const { storageKey, unreadableKey } = keys;
  // Another tab turned encryption on: this tab holds no key, so it locks instead of writing plain JSON over the envelope.
  const lockOut = useCallback((raw: string | null) => {
    lastStored.current = raw;
    lastSaved.current = null;
    saveSeq.current++;
    lock.current = null;
    writable.current = false;
    setEncrypted(true);
    setLocked(true);
    dispatch({ type: "restore", state: initialWorkspace });
  }, [dispatch]);
  useEffect(() => {
    let mounted = true;
    writable.current = false;
    lock.current = null;
    try {
      lastStored.current = localStorage.getItem(storageKey);
      if (isEnvelope(lastStored.current)) {
        queueMicrotask(() => { if (!mounted) return; setEncrypted(true); setLocked(true); setRestoring(false); });
        return () => { mounted = false; writable.current = false; };
      }
      const restored = restoreFromStorage(localStorage, { storageKey, unreadableKey });
      writable.current = restored.notice === null;
      lastSaved.current = lastStored.current === null ? null : restored.workspace;
      stale.current = restored.workspace === latest.current ? null : latest.current;
      dispatch({ type: "restore", state: restored.workspace });
      queueMicrotask(() => { if (!mounted) return; setUnreadable(restored.unreadable); if (restored.notice) notify(restored.notice, "error"); setRestoring(false); });
    } catch { queueMicrotask(() => { if (!mounted) return; notify("Penyimpanan browser tidak tersedia. Perubahan hanya bertahan selama sesi ini.", "error"); setRestoring(false); }); }
    return () => { mounted = false; writable.current = false; };
  }, [notify, dispatch, storageKey, unreadableKey]);
  const writeIfCurrent = useCallback((raw: string) => {
    if (localStorage.getItem(storageKey) !== lastStored.current) throw new WorkspaceChanged(conflictMessage);
    localStorage.setItem(storageKey, raw);
    lastStored.current = raw;
  }, [storageKey]);

  useEffect(() => {
    if (restoring || locked) return;
    if (stale.current) { if (state === stale.current) return; stale.current = null; }
    if (!writable.current || state === lastSaved.current) return;
    const n = ++saveSeq.current;
    const held = lock.current;
    const isLatest = () => n === saveSeq.current && lock.current === held;
    const saving = withStorageLock(storageKey, async () => {
      if (!isLatest()) return;
      if (!held) {
        let current: string | null = null;
        try { current = localStorage.getItem(storageKey); } catch { /* the write below reports unavailable storage */ }
        if (isEnvelope(current)) { queueMicrotask(() => lockOut(current)); return; }
      }
      let conflict = false;
      const write = (raw: string) => {
        try { writeIfCurrent(raw); lastSaved.current = state; }
        catch (error) { conflict = error instanceof WorkspaceChanged; throw error; }
      };
      const error = held
        ? await saveEncryptedWorkspace(state, raw => sealWorkspace(held, raw), write, isLatest)
        : saveLocalWorkspace(state, write);
      queueMicrotask(() => { if (isLatest()) setStorageError(conflict ? conflictMessage : error ?? ""); });
    });
    pendingSave.current = saving;
    void saving.catch(() => { if (isLatest()) setStorageError("Perubahan belum tersimpan. Ekspor backup dari profil workspace."); });
  }, [state, restoring, locked, encrypted, storageKey, lockOut, writeIfCurrent]);
  const allowSave = () => { writable.current = true; };

  const unlock = useCallback(async (passphrase: string): Promise<string | null> => {
    try {
      const raw = localStorage.getItem(storageKey);
      const restored = await restoreEncrypted(localStorage, { storageKey, unreadableKey }, passphrase);
      if (localStorage.getItem(storageKey) !== raw) return conflictMessage;
      lastStored.current = raw;
      lastSaved.current = restored.workspace;
      setStorageError("");
      lock.current = restored.lock;
      writable.current = restored.notice === null;
      stale.current = restored.workspace === latest.current ? null : latest.current;
      dispatch({ type: "restore", state: restored.workspace });
      setUnreadable(restored.unreadable);
      if (restored.notice) notify(restored.notice, "error");
      setLocked(false);
      return null;
    } catch (reason) { return reason instanceof WrongPassphrase ? "Passphrase salah." : "Workspace terenkripsi tidak dapat dibaca."; }
  }, [dispatch, notify, storageKey, unreadableKey]);
  // Every pending save finishes first, including one an edit started during the wait, then the key and the workspace
  // leave memory.
  const lockNow = useCallback(async () => {
    let waited: Promise<unknown>;
    do { waited = pendingSave.current; await waited.catch(() => undefined); } while (waited !== pendingSave.current);
    saveSeq.current++;
    lock.current = null;
    setLocked(true);
    dispatch({ type: "restore", state: initialWorkspace });
  }, [dispatch]);
  // The envelope is written here, before the UI says "terenkripsi": a workspace that cannot be saved, or an envelope that
  // does not fit in the browser's quota, leaves the plain workspace in place and reports why.
  const enable = useCallback(async (passphrase: string) => {
    if (!writable.current) throw new Error("Workspace ini belum dapat disimpan. Pulihkan backup atau hapus data lokal dulu.");
    const next = await createLock(passphrase);
    const sealed = await sealWorkspace(next, JSON.stringify(latest.current));
    await withStorageLock(storageKey, () => {
      try { writeIfCurrent(sealed); } catch (error) {
        if (error instanceof WorkspaceChanged) throw error;
        throw new Error("Workspace terlalu besar untuk dienkripsi di browser ini. Ekspor backup, lalu hapus encounter lama.");
      }
      saveSeq.current++;
      lock.current = next;
      setEncrypted(true);
    });
  }, [storageKey, writeIfCurrent]);
  // Offered only while unlocked, and only with the current passphrase (it writes the workspace back as readable JSON):
  // a wrong one throws WrongPassphrase and storage stays encrypted.
  // Plain JSON is written here, so the guard against another tab's envelope never mistakes this tab's own for one.
  // Checking the passphrase takes a moment; if the workspace locked meanwhile, memory holds the empty workspace and nothing
  // may be written.
  const disable = useCallback(async (passphrase: string) => {
    const held = lock.current;
    await openWorkspace(passphrase, localStorage.getItem(storageKey) ?? "");
    const lockedMeanwhile = () => new Error("Workspace terkunci sebelum enkripsi dimatikan. Buka lalu coba lagi.");
    if (!held || lock.current !== held) throw lockedMeanwhile();
    await withStorageLock(storageKey, () => {
      if (lock.current !== held) throw lockedMeanwhile();
      try { writeIfCurrent(JSON.stringify(latest.current)); } catch (error) {
        throw new Error(error instanceof WorkspaceChanged ? conflictMessage : "Enkripsi belum dimatikan: workspace tidak dapat disimpan ke browser.");
      }
      saveSeq.current++;
      lock.current = null;
      setEncrypted(false);
    });
  }, [storageKey, writeIfCurrent]);
  // A forgotten passphrase: the encrypted copy is removed and the workspace starts again (the UI confirms first).
  // Reloading drops everything the previous session left in component state (composer text, drafts, a running analysis).
  const forget = useCallback(() => {
    void withStorageLock(storageKey, () => {
      if (localStorage.getItem(storageKey) === lastStored.current) localStorage.removeItem(storageKey);
    }).finally(() => location.reload()).catch(() => undefined);
  }, [storageKey]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => { if (event.key === storageKey && !lock.current && isEnvelope(event.newValue)) lockOut(event.newValue); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey, lockOut]);

  useEffect(() => {
    if (!encrypted || locked) return;
    let timer = setTimeout(() => void lockNow(), idleLockMs);
    const reset = () => { clearTimeout(timer); timer = setTimeout(() => void lockNow(), idleLockMs); };
    for (const name of inputEvents) window.addEventListener(name, reset, { passive: true });
    return () => { clearTimeout(timer); for (const name of inputEvents) window.removeEventListener(name, reset); };
  }, [encrypted, locked, lockNow]);

  return { storageError, unreadable, setUnreadable, restoring, allowSave, locked, unlock, forget, encryption: { enabled: encrypted, enable, disable, lockNow } };
}
