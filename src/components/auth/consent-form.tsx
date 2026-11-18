"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { betaPolicyVersion, betaProfessions, validProfile } from "../../lib/auth/policy";

export function ConsentForm() {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [profession, setProfession] = useState("");
  const [registration, setRegistration] = useState("");
  const [practice, setPractice] = useState("");
  const profile = validProfile({ profession, registration, practice });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<"session" | "retry" | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!accepted || !profile || request.current) return;
    const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 10_000);
    setPending(true); setError(null);
    try {
      const response = await fetch("/api/onboarding/consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: betaPolicyVersion, accepted: true, profile }), signal: controller.signal });
      if (!response.ok) { setError(response.status === 401 ? "session" : "retry"); return; }
      router.replace("/"); router.refresh();
    } catch { setError("retry"); }
    finally { clearTimeout(timeout); request.current = null; setPending(false); }
  }
  return <form onSubmit={submit}>
    <p>Beta ini untuk tenaga kesehatan. Isi profil profesi Anda; nomor STR dicatat sebagaimana diketik dan belum diverifikasi otomatis.</p>
    <label className="auth-field">Profesi<select required value={profession} disabled={pending} onChange={event => setProfession(event.target.value)}><option value="" disabled>Pilih profesi</option>{betaProfessions.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
    <label className="auth-field">Nomor STR<input required value={registration} maxLength={40} autoComplete="off" disabled={pending} onChange={event => setRegistration(event.target.value)}/></label>
    <label className="auth-field">Lokasi praktik<input required value={practice} maxLength={120} placeholder="Nama fasilitas dan kota" disabled={pending} onChange={event => setPractice(event.target.value)}/></label>
    <p>Keluaran tetap memerlukan penilaian klinisi. Data workspace tersimpan di browser perangkat ini dan tidak terenkripsi.</p>
    <p><a href="https://sentrapedia.vercel.app/ketentuan/">Ketentuan beta</a> · <a href="https://sentrapedia.vercel.app/privasi/">Kebijakan privasi</a></p>
    <label className="auth-consent"><input type="checkbox" required checked={accepted} disabled={pending} onChange={event => setAccepted(event.target.checked)}/>Saya memahami batasan beta.</label>
    {pending && <p role="status">Menyimpan persetujuan…</p>}
    {error && <p role="alert">{error === "session" ? <>Sesi berakhir. <Link href="/sign-in">Masuk kembali</Link> untuk melanjutkan.</> : "Persetujuan belum tersimpan. Coba kembali."}</p>}
    <button className="auth-primary" type="submit" disabled={!accepted || !profile || pending}>Setuju dan buka workspace</button>
  </form>;
}
