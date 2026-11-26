// Workspace logic moved out of components/workspace.tsx (tech-debt row 37) so it can be tested without a browser.
import type { ModeId } from "./drafts";
import { freshReview, type PersonalTemplate, type ReviewItem } from "./workflow";
import { emptyWorkspace, loadWorkspace, newId, parseWorkspace, storageKey, unreadableKey, type Message, type Patient, type Settings, type Workspace } from "./workspace";
import { openWorkspace, type WorkspaceLock } from "./workspace-crypto";
import type { WorkspaceStorageKeys } from "./workspace-storage";

export type Shortcut = "commands" | "search" | "new";

/** Ctrl or Cmd with J (command palette), / (search) or K (new encounter); none while a dialog or the mobile navigation is open. */
export function shortcutFor(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey">, blocked: boolean): Shortcut | null {
  if (blocked || !(event.metaKey || event.ctrlKey)) return null;
  if (event.key.toLowerCase() === "j") return "commands";
  if (event.key === "/") return "search";
  if (event.key.toLowerCase() === "k") return "new";
  return null;
}

/**
 * Reads the saved workspace. Saved text that fails validation is copied to `unreadableKey` (when it fits) and returned
 * so it can be downloaded instead of lost; an earlier unreadable copy stays on offer. Throws when storage is unavailable.
 */
export function restoreFromStorage(storage: Pick<Storage, "getItem" | "setItem">, keys: WorkspaceStorageKeys = { storageKey, unreadableKey }): { workspace: Workspace; unreadable: string | null; notice: string | null } {
  const loaded = loadWorkspace(storage.getItem(keys.storageKey));
  if (loaded.unreadable) {
    try { storage.setItem(keys.unreadableKey, loaded.unreadable); } catch { /* no room for a second copy: the copy in memory stays downloadable until reload */ }
  }
  return {
    workspace: loaded.workspace,
    unreadable: loaded.unreadable ?? storage.getItem(keys.unreadableKey),
    notice: loaded.unreadable ? "Workspace tersimpan tidak dapat dibaca. Datanya disimpan sebagai cadangan dan dapat diunduh dari menu Workspace." : null,
  };
}

/**
 * Opens an encrypted saved workspace. A wrong passphrase throws and writes nothing. A workspace that decrypts but fails
 * validation keeps its ciphertext (D4): the ciphertext, never a decrypted copy, goes to `unreadableKey` and is offered.
 */
export async function restoreEncrypted(storage: Pick<Storage, "getItem" | "setItem">, keys: WorkspaceStorageKeys, passphrase: string): Promise<{ workspace: Workspace; lock: WorkspaceLock; unreadable: string | null; notice: string | null }> {
  const raw = storage.getItem(keys.storageKey) ?? "";
  const { lock, plaintext } = await openWorkspace(passphrase, raw);
  const workspace = parseWorkspace(plaintext);
  if (workspace) return { workspace, lock, unreadable: storage.getItem(keys.unreadableKey), notice: null };
  try { storage.setItem(keys.unreadableKey, raw); } catch { /* no room for a second copy: the ciphertext stays in place */ }
  return { workspace: emptyWorkspace, lock, unreadable: raw, notice: "Workspace terenkripsi tidak dapat dibaca. Datanya disimpan sebagai cadangan terenkripsi dan dapat diunduh dari menu Workspace." };
}

/** The user's text and its local draft, with the source the draft was made from; `fallback` records why the draft stood in for a failed analysis. */
export function localDraftMessages({ text, content, mode, context, patient, settings, reviewDefaults, personal, fallback }: { text: string; content: string; mode: ModeId; context: string; patient?: Patient; settings: Settings; reviewDefaults?: ReviewItem[]; personal?: PersonalTemplate; fallback?: string }): Message[] {
  const createdAt = new Date().toISOString();
  const sourceText = [
    `Input\n${text}`,
    personal && `Templat saat dibuat\n${JSON.stringify(personal, null, 2)}`,
    context && `Konteks Encounter\n${context}`,
    patient && `Pasien\n${patient.name}\n${patient.age}\n${patient.sex}\nCatatan Pasien\n${patient.notes}`,
    `Preferensi format\n${settings.specialty} · ${settings.model} · ${settings.language}\n${settings.instructions}`,
    fallback && `Analisis AADI tidak tersedia\n${fallback}`,
  ].filter(Boolean).join("\n\n");
  return [
    { id: newId(), role: "user", content: text.trim(), mode, createdAt },
    { id: newId(), role: "assistant", content, originalContent: content, reviewStatus: "draft", reviewItems: freshReview(reviewDefaults), ...(personal ? { templateSnapshot: { ...personal, sections: [...personal.sections] } } : {}), sourceText, mode, createdAt },
  ];
}
