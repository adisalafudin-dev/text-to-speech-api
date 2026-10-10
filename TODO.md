# TODO — Custom TTS API

Roadmap pengembangan REST API Text-to-Speech berbasis Express.js, `msedge-tts`, Docker, dan n8n untuk otomatisasi pembuatan konten YouTube.

## Status saat ini

- [x] Endpoint `POST /api/tts`
- [x] Voice dapat dikonfigurasi melalui payload
- [x] Output audio MP3
- [x] Preprocessor jargon berbasis dictionary
- [x] Penyimpanan audio sementara
- [x] Cleanup file setelah proses pengiriman
- [x] Dockerfile dan Docker Compose
- [x] Health check dasar

> Tandai item sebagai selesai (`[x]`) setelah implementasi dan pengujiannya benar-benar selesai.

---

## P0 — Keamanan dan keandalan dasar

- [ ] **Tambahkan autentikasi API key**
  - [ ] Baca secret dari environment variable, jangan hardcode di source code.
  - [ ] Tolak request tanpa key yang valid dengan HTTP `401`.
  - [ ] Jangan mencetak API key ke log.
- [ ] **Batasi akses jaringan**
  - [ ] Untuk penggunaan rumahan, jangan expose port ke internet secara langsung.
  - [ ] Jika n8n dan TTS berjalan di Docker, gunakan internal Docker network bila memungkinkan.
  - [ ] Jika akses eksternal diperlukan, gunakan reverse proxy/tunnel dan autentikasi.
- [ ] **Tambahkan rate limiting**
  - [ ] Batasi request per klien/API key.
  - [ ] Tentukan batas konkurensi agar server tidak dibanjiri proses TTS.
- [ ] **Perkuat validasi request**
  - [ ] Batasi panjang teks dan ukuran payload.
  - [ ] Validasi format nama voice dengan allowlist voice yang didukung.
  - [ ] Tangani JSON invalid, field kosong, tipe data salah, dan voice yang tidak valid.
- [ ] **Perbaiki lifecycle file sementara**
  - [ ] Pastikan file dihapus setelah response selesai maupun gagal.
  - [ ] Tangani koneksi klien yang terputus.
  - [ ] Tambahkan job pembersihan berkala untuk file yatim akibat container crash atau restart.
  - [ ] Pastikan cleanup tidak menghapus file yang sedang digunakan request lain.
- [ ] **Pastikan kompatibilitas library**
  - [ ] Pin versi dependency melalui lockfile (`package-lock.json`).
  - [ ] Uji API `msedge-tts` yang benar-benar terpasang, termasuk nama properti path file hasil.
  - [ ] Tangani error koneksi ke layanan TTS eksternal dan timeout.

## P1 — Kualitas suara dan preprocessor

- [ ] **Perluas kamus jargon**
  - [ ] Tambahkan istilah seperti API, JSON, GPIO, IoT, HTTP, HTTPS, SQL, PostgreSQL, Express.js, React, dan Docker.
  - [ ] Tambahkan istilah sesuai topik video yang akan dibuat.
  - [ ] Buat unit test untuk setiap istilah.
- [ ] **Tingkatkan pencocokan istilah**
  - [ ] Tangani kapitalisasi dan batas kata secara konsisten.
  - [ ] Hindari mengganti istilah di dalam kata yang lebih panjang.
  - [ ] Uji istilah bertumpang tindih, tanda baca, angka, dan teks multibahasa.
  - [ ] Pertimbangkan dictionary yang bisa dimuat dari file JSON tanpa mengubah kode server.
- [ ] **Pisahkan preprocessor menjadi modul**
  - [ ] Pindahkan kamus dan fungsi ke `src/preprocessor.js`.
  - [ ] Tambahkan opsi untuk mengaktifkan/menonaktifkan preprocessing per request.
  - [ ] Opsional: sediakan mode preview untuk melihat teks hasil preprocessing tanpa membuat audio.
- [ ] **Dukung parameter suara**
  - [ ] Evaluasi dukungan rate, pitch, dan volume pada versi library yang digunakan.
  - [ ] Terapkan batas nilai untuk setiap parameter.
  - [ ] Buat preset suara untuk intro, narasi normal, dan penekanan.
- [ ] **Evaluasi kualitas hasil**
  - [ ] Dengarkan sampel untuk istilah teknis, singkatan, angka, tanggal, URL, dan tanda baca.
  - [ ] Uji teks panjang dan paragraf dengan jeda.
  - [ ] Catat voice yang paling cocok untuk bahasa Indonesia.

## P2 — Fitur yang membantu workflow YouTube

- [ ] **Dukungan teks panjang**
  - [ ] Uji batas panjang teks yang aman untuk layanan TTS.
  - [ ] Pecah teks berdasarkan paragraf atau kalimat bila melewati batas.
  - [ ] Gabungkan hasil audio dengan tool yang sesuai bila chunking diperlukan.
  - [ ] Tambahkan jeda yang konsisten antarbagian.
- [ ] **Batch generation**
  - [ ] Tambahkan endpoint batch jika memang diperlukan.
  - [ ] Batasi jumlah item per batch dan konkurensi.
  - [ ] Kembalikan status tiap item dengan jelas jika sebagian gagal.
- [ ] **Metadata dan nama file**
  - [ ] Izinkan nama file yang aman atau gunakan ID request.
  - [ ] Jangan menggunakan input pengguna langsung sebagai path filesystem.
  - [ ] Sertakan metadata request seperti durasi, voice, dan waktu pembuatan bila tersedia.
- [ ] **Subtitle**
  - [ ] Evaluasi cara menghasilkan subtitle atau timestamp yang selaras dengan audio.
  - [ ] Ekspor hasil ke format SRT atau VTT jika tersedia sumber timestamp yang dapat diandalkan.
  - [ ] Jangan menganggap timestamp perkiraan sebagai sinkronisasi yang akurat.
- [ ] **Integrasi n8n**
  - [ ] Buat workflow contoh: sumber skrip → normalisasi teks → TTS → simpan MP3.
  - [ ] Tambahkan error branch dan retry dengan backoff untuk error sementara.
  - [ ] Pastikan retry tidak menyebabkan file duplikat yang tidak diperlukan.
  - [ ] Dokumentasikan pengaturan binary response dan lokasi penyimpanan file.
  - [ ] Tambahkan notifikasi ketika workflow gagal.

## P3 — Observability dan pemeliharaan

- [ ] **Logging terstruktur**
  - [ ] Catat request ID, durasi sintesis, ukuran file, voice, dan status.
  - [ ] Jangan log seluruh isi skrip jika tidak dibutuhkan.
  - [ ] Jangan log secret atau data sensitif.
- [ ] **Metrik**
  - [ ] Hitung request sukses/gagal, waktu sintesis, dan ukuran audio.
  - [ ] Pantau jumlah file sementara dan penggunaan disk.
  - [ ] Tambahkan endpoint metrik hanya jika dibutuhkan dan lindungi aksesnya.
- [ ] **Health check**
  - [ ] Bedakan status proses API dari ketersediaan layanan TTS eksternal.
  - [ ] Hindari memanggil TTS berulang kali hanya untuk health check.
- [ ] **Graceful shutdown**
  - [ ] Tangani SIGTERM/SIGINT.
  - [ ] Berhenti menerima request baru dan beri request aktif kesempatan menyelesaikan proses sesuai batas waktu.
- [ ] **Monitoring container**
  - [ ] Periksa log dengan `docker compose logs`.
  - [ ] Tentukan batas CPU/memori berdasarkan pengujian.
  - [ ] Perbarui image base dan dependency secara terencana.

## P4 — Testing dan kualitas kode

- [ ] Tambahkan unit test untuk `preprocessText()`.
- [ ] Tambahkan test validasi payload dan voice.
- [ ] Tambahkan integration test untuk endpoint `/api/tts`.
- [ ] Uji respons ketika layanan eksternal gagal atau timeout.
- [ ] Uji penghapusan file setelah response selesai.
- [ ] Uji request bersamaan untuk memastikan nama file tidak bentrok.
- [ ] Tambahkan linting dan formatting.
- [ ] Tambahkan CI untuk menjalankan test setiap perubahan kode.
- [ ] Tambahkan test smoke setelah container dibangun.

## P5 — Dokumentasi dan deployment

- [ ] Buat `README.md` berisi setup lokal, Docker, contoh request, dan troubleshooting.
- [ ] Dokumentasikan environment variable yang didukung.
- [ ] Tambahkan `.env.example` tanpa secret sungguhan jika konfigurasi mulai bertambah.
- [ ] Dokumentasikan cara backup konfigurasi dan memperbarui container.
- [ ] Catat bahwa `msedge-tts` memerlukan koneksi internet dan bergantung pada layanan eksternal.
- [ ] Evaluasi ketentuan penggunaan layanan TTS untuk jenis konten dan skala penggunaan yang direncanakan.
- [ ] Buat prosedur rollback jika versi baru bermasalah.
- [ ] Refactor code

---

## Rencana pengerjaan yang disarankan

### Tahap 1 — Stabilkan fondasi

- [ ] Verifikasi API berjalan dengan versi `msedge-tts` yang terkunci.
- [ ] Tambahkan autentikasi API key dan rate limiting.
- [ ] Pastikan cleanup file tahan terhadap kegagalan.
- [ ] Tambahkan test untuk preprocessor dan validasi.

### Tahap 2 — Siapkan workflow produksi pribadi

- [ ] Buat workflow n8n dari teks sampai file MP3 tersimpan.
- [ ] Tambahkan retry, timeout, dan notifikasi kegagalan.
- [ ] Uji beberapa request berurutan dan bersamaan.
- [ ] Pantau log dan disk selama penggunaan nyata.

### Tahap 3 — Tingkatkan kualitas konten

- [ ] Perluas kamus jargon berdasarkan kebutuhan nyata.
- [ ] Uji teks panjang dan chunking.
- [ ] Evaluasi subtitle, preset suara, dan batch generation berdasarkan kebutuhan.

---

## Definition of Done

Sebuah item dianggap selesai jika:

1. Implementasinya sudah masuk ke kode.
2. Pengujian yang relevan sudah dijalankan.
3. Error path dan edge case utama sudah dipertimbangkan.
4. Dokumentasi terkait sudah diperbarui.
5. Tidak ada secret yang disimpan di source control.

## Catatan

Prioritaskan keamanan, keandalan, dan pengujian sebelum menambah banyak fitur. Untuk penggunaan pribadi, API key, cleanup yang andal, validasi, dan workflow n8n yang memiliki error handling biasanya lebih bernilai daripada langsung membangun batch processing atau sistem subtitle yang kompleks.
