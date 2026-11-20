// Passphrase encryption of the saved workspace (docs/specs/2026-11-19-workspace-encryption-design.md, approved D1 to D6).
// Web Crypto only: PBKDF2-SHA-256 derives a non-extractable AES-GCM key from the passphrase and a random salt; every save
// uses a fresh IV. The key lives in memory only.

export const pbkdf2Iterations = 600_000;
export const minPassphraseLength = 10;
const minIterations = 100_000, maxIterations = 10_000_000;

export type WorkspaceLock = { key: CryptoKey; salt: Uint8Array<ArrayBuffer>; iter: number };
type Envelope = { v: 1; kdf: "PBKDF2-SHA256"; iter: number; salt: string; iv: string; ct: string };

export class WrongPassphrase extends Error { constructor() { super("Passphrase salah."); } }
export class BadEnvelope extends Error { constructor() { super("Workspace terenkripsi tidak dapat dibaca."); } }

// btoa always pads to a multiple of 4; any other length is a damaged envelope, not a wrong passphrase.
const base64 = /^[A-Za-z0-9+/]+={0,2}$/;
function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}
function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const raw = atob(text), bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function parseEnvelope(raw: string | null): Envelope | null {
  if (!raw) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== "object") return null;
  const e = value as Record<string, unknown>;
  const b64 = (v: unknown, length?: number) => typeof v === "string" && v.length % 4 === 0 && base64.test(v) && (length === undefined || fromBase64(v).length === length);
  return e.v === 1 && e.kdf === "PBKDF2-SHA256" && Number.isInteger(e.iter) && (e.iter as number) >= minIterations && (e.iter as number) <= maxIterations
    && b64(e.salt, 16) && b64(e.iv, 12) && b64(e.ct) ? e as Envelope : null;
}

/** True when the saved value is an encrypted workspace with a cost this build accepts. */
export function isEnvelope(raw: string | null): boolean { return parseEnvelope(raw) !== null; }

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iter: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function createLock(passphrase: string, iter = pbkdf2Iterations): Promise<WorkspaceLock> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { key: await deriveKey(passphrase, salt, iter), salt, iter };
}

export async function sealWorkspace(lock: WorkspaceLock, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, lock.key, new TextEncoder().encode(plaintext)));
  const envelope: Envelope = { v: 1, kdf: "PBKDF2-SHA256", iter: lock.iter, salt: toBase64(lock.salt), iv: toBase64(iv), ct: toBase64(ct) };
  return JSON.stringify(envelope);
}

/** Decrypts a saved envelope. Throws BadEnvelope for a malformed one and WrongPassphrase when authentication fails. */
export async function openWorkspace(passphrase: string, raw: string): Promise<{ lock: WorkspaceLock; plaintext: string }> {
  const envelope = parseEnvelope(raw);
  if (!envelope) throw new BadEnvelope();
  const salt = fromBase64(envelope.salt);
  const lock = { key: await deriveKey(passphrase, salt, envelope.iter), salt, iter: envelope.iter };
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(envelope.iv) }, lock.key, fromBase64(envelope.ct));
    return { lock, plaintext: new TextDecoder().decode(plain) };
  } catch { throw new WrongPassphrase(); }
}
