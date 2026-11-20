import type { Metadata } from "next";
import { AuthFrame } from "../../components/auth/auth-frame";

export const metadata: Metadata = { title: "Ketentuan dan privasi beta · Sentrapedia" };

export default function BetaPolicy() {
  return <AuthFrame title="Ketentuan dan privasi workspace beta">
    <section aria-labelledby="ketentuan">
      <h2 id="ketentuan">Ketentuan beta</h2>
      <p>Sentrapedia mendukung tenaga kesehatan dalam menyiapkan draf dan mencari referensi. Periksa keluaran dan sumbernya sebelum dipakai. Keputusan klinis tetap menjadi tanggung jawab tenaga kesehatan yang menangani kasus.</p>
      <p>Gunakan kode kasus. Jangan masukkan nama pasien, nomor identitas atau rekam medis, alamat, kontak, atau rincian lain yang dapat mengidentifikasi pasien ke catatan, analisis, dikte, atau formulir masukan.</p>
    </section>
    <section aria-labelledby="privasi">
      <h2 id="privasi">Kebijakan privasi workspace</h2>
      <ul>
        <li><strong>Akun.</strong> Clerk menangani akun dan sesi. Profil yang diisi saat onboarding (profesi, nomor STR, dan lokasi praktik) serta versi dan waktu persetujuan disimpan di Clerk untuk akses beta.</li>
        <li><strong>Perangkat.</strong> Catatan dan draf disimpan di browser. Enkripsi dengan passphrase tersedia di pengaturan workspace. Keluar dari akun tidak menghapus salinan di perangkat. File backup yang diunduh tidak terenkripsi.</li>
        <li><strong>Analisis dan dikte.</strong> Saat meminta analisis, bagian kasus dan kutipan referensi yang diperlukan dikirim ke Google Gemini. Pemeriksaan pola identitas bisa melewatkan rincian yang mengenali pasien. Saat dikte diaktifkan, pengenalan suara ditangani browser dan dapat memakai layanan penyedianya.</li>
        <li><strong>Server.</strong> Jika tersedia, sinkronisasi manual menyimpan salinan terbatas dari encounter dan templat. Server juga dapat menyimpan catatan kuota analisis, masukan, dan laporan keluaran yang dikirim pengguna.</li>
      </ul>
      <p>Untuk pertanyaan atau permintaan terkait data akun, hubungi pengelola melalui <a href="https://sentrapedia.vercel.app/#sentrapedia-contact">formulir kontak Sentrapedia</a>. Jangan sertakan data pasien.</p>
    </section>
  </AuthFrame>;
}
