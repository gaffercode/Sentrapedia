// v2 drops the synthetic-only declaration: the wording the user accepts changed, so a v1 consent is not this one.
export const betaPolicyVersion = "sentrapedia-beta-v2";
export type BetaConsent = { version: string; acceptedAt: string };
// Gaffer, 2026-11-17: Clerk's waitlist holds an email address only, so the professional profile is asked here, once,
// with the acknowledgement. The registration number is stored as typed; nothing checks it against the KKI register.
export const betaProfessions = ["Dokter", "Dokter spesialis", "Dokter gigi", "Perawat", "Bidan", "Apoteker", "Tenaga kesehatan lain"] as const;
export type BetaProfile = { profession: (typeof betaProfessions)[number]; registration: string; practice: string };
const registrationPattern = /^[A-Za-z0-9][A-Za-z0-9./ -]{3,39}$/;
const practicePattern = /^[^\p{Cc}]{3,120}$/u;

/** The trimmed profile, or null when a field is missing or malformed. */
export function validProfile(value: unknown): BetaProfile | null {
  if (!isRecord(value) || Object.keys(value).length !== 3) return null;
  const { profession, registration, practice } = value;
  if (typeof profession !== "string" || !(betaProfessions as readonly string[]).includes(profession)) return null;
  if (typeof registration !== "string" || typeof practice !== "string") return null;
  const number = registration.trim(), place = practice.trim();
  if (!registrationPattern.test(number) || !practicePattern.test(place)) return null;
  return { profession: profession as BetaProfile["profession"], registration: number, practice: place };
}
export type BetaUser = { id: string; emailVerified: boolean; privateMetadata: Record<string, unknown> };
export type AccessResult = { status: "allowed"; userId: string } | { status: "signed-out" | "consent-required" | "disabled" | "unavailable" };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function validUserId(value: string): boolean { return /^user_[A-Za-z0-9]{1,120}$/.test(value); }

export function assessBetaUser(user: BetaUser, requireConsent: boolean): AccessResult {
  if (!user.emailVerified || !isRecord(user.privateMetadata)) return { status: "disabled" };
  const access = user.privateMetadata.sentrapediaBetaAccess;
  if (access !== undefined && (!isRecord(access) || access.disabled !== false)) return { status: "disabled" };
  const consent = user.privateMetadata.sentrapediaBetaConsent;
  const currentConsent = isRecord(consent) && consent.version === betaPolicyVersion && typeof consent.acceptedAt === "string" && Number.isFinite(Date.parse(consent.acceptedAt));
  // An account without its profile, one that consented earlier included, goes back to the onboarding step that asks for it.
  if (requireConsent && (!currentConsent || !validProfile(user.privateMetadata.sentrapediaBetaProfile))) return { status: "consent-required" };
  return { status: "allowed", userId: user.id };
}
