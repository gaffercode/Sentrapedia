import { describe, expect, it } from "vitest";
import { BadEnvelope, WrongPassphrase, createLock, isEnvelope, openWorkspace, pbkdf2Iterations, sealWorkspace } from "../src/lib/workspace-crypto";

// Passphrase encryption of the saved workspace (docs/specs/2026-11-19-workspace-encryption-design.md, D1). Tests use a
// low iteration count so they stay fast; the default is checked on its own.
const iter = 100_000;
const plain = JSON.stringify({ version: 2, patients: [], encounters: [] });

describe("workspace crypto", () => {
  it("uses 600,000 PBKDF2 iterations by default", () => {
    expect(pbkdf2Iterations).toBe(600_000);
  });
  it("round-trips the workspace under the same passphrase", async () => {
    const lock = await createLock("passphrase-uji-1", iter);
    const sealed = await sealWorkspace(lock, plain);
    expect(isEnvelope(sealed)).toBe(true);
    expect(sealed).not.toContain("patients");
    const opened = await openWorkspace("passphrase-uji-1", sealed);
    expect(opened.plaintext).toBe(plain);
    expect(await openWorkspace("passphrase-uji-1", await sealWorkspace(opened.lock, plain))).toMatchObject({ plaintext: plain });
  });
  it("uses a fresh IV for every save", async () => {
    const lock = await createLock("passphrase-uji-1", iter);
    const [a, b] = [JSON.parse(await sealWorkspace(lock, plain)), JSON.parse(await sealWorkspace(lock, plain))];
    expect(a.iv).not.toBe(b.iv);
    expect(a.salt).toBe(b.salt);
  });
  it("refuses a wrong passphrase and a tampered ciphertext", async () => {
    const sealed = await sealWorkspace(await createLock("passphrase-uji-1", iter), plain);
    await expect(openWorkspace("passphrase-salah", sealed)).rejects.toBeInstanceOf(WrongPassphrase);
    const envelope = JSON.parse(sealed);
    const ct = atob(envelope.ct);
    envelope.ct = btoa(String.fromCharCode(ct.charCodeAt(0) ^ 1) + ct.slice(1));
    await expect(openWorkspace("passphrase-uji-1", JSON.stringify(envelope))).rejects.toBeInstanceOf(WrongPassphrase);
  });
  it("tells an envelope from plain workspace JSON and refuses one with an out-of-range cost", async () => {
    const sealed = JSON.parse(await sealWorkspace(await createLock("passphrase-uji-1", iter), plain));
    expect(isEnvelope(plain)).toBe(false);
    expect(isEnvelope(null)).toBe(false);
    expect(isEnvelope("not json")).toBe(false);
    for (const bad of [{ ...sealed, iter: 1 }, { ...sealed, iter: 50_000_000 }, { ...sealed, salt: "***" }, { ...sealed, ct: undefined }, { ...sealed, ct: `${sealed.ct}A` }, { ...sealed, ct: "AAAAA" }]) {
      expect(isEnvelope(JSON.stringify(bad))).toBe(false);
      await expect(openWorkspace("passphrase-uji-1", JSON.stringify(bad))).rejects.toBeInstanceOf(BadEnvelope);
    }
  });
});
