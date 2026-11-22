import { Waitlist } from "@clerk/nextjs";
import { AuthFrame, AccessNotice, site } from "../../components/auth/auth-frame";
import { getAuthConfig } from "../../lib/auth/server";
export const dynamic = "force-dynamic";
// The beta waitlist. In Clerk's Waitlist access mode an uninvited /sign-up is sent here (waitlistUrl in the root layout),
// so this page must render the request form itself and never redirect back to /sign-up, or the two would loop.
// Clerk keeps only the email address; the professional profile is asked once, at onboarding (src/lib/auth/policy.ts).
export default function Apply() {
  if (getAuthConfig().mode !== "clerk") return <AccessNotice unavailable/>;
  return <AuthFrame title="Gabung waitlist beta" alternative={{ href: "/sign-in", prompt: "Sudah punya akun?", label: "Masuk" }}><p>Sentrapedia sedang dalam beta tertutup untuk dokter dan tenaga kesehatan di Indonesia. Tinggalkan email pribadi; setelah permintaan disetujui, undangan pribadi dikirim ke email tersebut.</p><Waitlist signInUrl="/sign-in" afterJoinWaitlistUrl={site}/></AuthFrame>;
}
