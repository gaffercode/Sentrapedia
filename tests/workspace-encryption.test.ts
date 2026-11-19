import { describe, expect, it } from "vitest";
import { createLock, isEnvelope, sealWorkspace, WrongPassphrase } from "../src/lib/workspace-crypto";
import { restoreEncrypted } from "../src/lib/workspace-session";
import { saveEncryptedWorkspace } from "../src/lib/workflow";
import { initialWorkspace } from "../src/lib/workspace";

// Restore and save of an encrypted workspace (docs/specs/2026-11-19-workspace-encryption-design.md).
const keys = { storageKey: "w", unreadableKey: "w:unreadable" };
const memory = (entries: Record<string, string> = {}) => {
  const data = new Map(Object.entries(entries));
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
};
const lockOf = () => createLock("passphrase-uji-1", 100_000);

describe("restoreEncrypted", () => {
  it("opens the saved workspace with the right passphrase", async () => {
    const storage = memory({ w: await sealWorkspace(await lockOf(), JSON.stringify(initialWorkspace)) });
    const restored = await restoreEncrypted(storage, keys, "passphrase-uji-1");
    expect(restored.workspace).toEqual(initialWorkspace);
    expect(restored.unreadable).toBeNull();
    expect(restored.lock.iter).toBe(100_000);
  });
  it("leaves storage untouched on a wrong passphrase", async () => {
    const sealed = await sealWorkspace(await lockOf(), JSON.stringify(initialWorkspace));
    const storage = memory({ w: sealed });
    await expect(restoreEncrypted(storage, keys, "passphrase-salah")).rejects.toBeInstanceOf(WrongPassphrase);
    expect([...storage.data]).toEqual([["w", sealed]]);
  });
  it("keeps the ciphertext, never a decrypted copy, when the workspace inside fails validation (D4)", async () => {
    const sealed = await sealWorkspace(await lockOf(), JSON.stringify({ version: 1, rahasia: "isi pasien" }));
    const storage = memory({ w: sealed });
    const restored = await restoreEncrypted(storage, keys, "passphrase-uji-1");
    expect(restored.unreadable).toBe(sealed);
    expect(restored.notice).toContain("tidak dapat dibaca");
    for (const value of storage.data.values()) { expect(value).not.toContain("rahasia"); expect(isEnvelope(value)).toBe(true); }
  });
});

describe("saveEncryptedWorkspace", () => {
  it("writes an envelope and warns on the plaintext length", async () => {
    const lock = await lockOf();
    const writes: string[] = [];
    const big = { ...initialWorkspace, patients: [{ id: "p", name: "x".repeat(4_100_000), age: "", sex: "", notes: "" }] };
    const warning = await saveEncryptedWorkspace(big, raw => sealWorkspace(lock, raw), raw => writes.push(raw), () => true);
    expect(isEnvelope(writes[0])).toBe(true);
    expect(warning).toContain("hampir penuh");
    expect(await saveEncryptedWorkspace(initialWorkspace, raw => sealWorkspace(lock, raw), raw => writes.push(raw), () => true)).toBeNull();
  });
  it("warns on the stored (sealed) length, which is larger than the plaintext", async () => {
    const lock = await lockOf();
    const mid = { ...initialWorkspace, patients: [{ id: "p", name: "x".repeat(3_200_000), age: "", sex: "", notes: "" }] };
    expect(await saveEncryptedWorkspace(mid, raw => sealWorkspace(lock, raw), () => undefined, () => true)).toContain("hampir penuh");
  });
  it("lets a newer save win over an older one that finishes later", async () => {
    const writes: string[] = [];
    let latest = 0, releaseOld: (value: string) => void = () => undefined;
    const older = saveEncryptedWorkspace(initialWorkspace, () => new Promise<string>(resolve => { releaseOld = resolve; }), raw => writes.push(raw), ((n: number) => () => n === latest)(++latest));
    await saveEncryptedWorkspace(initialWorkspace, async () => "newer", raw => writes.push(raw), ((n: number) => () => n === latest)(++latest));
    releaseOld("older");
    await older;
    expect(writes).toEqual(["newer"]);
  });
  it("reports a failed write like the plain save", async () => {
    const lock = await lockOf();
    expect(await saveEncryptedWorkspace(initialWorkspace, raw => sealWorkspace(lock, raw), () => { throw new Error("full"); }, () => true)).toContain("belum tersimpan");
  });
});
