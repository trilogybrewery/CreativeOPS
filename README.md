# Creative Ops Trilogy

Aplikasi web untuk workflow tim creative: ticket, board 8 tahap, upload file, SLA otomatis, notifikasi, Weekly AD, dan Monthly CD. Dibuat dengan Next.js. Database (SQLite) dan semua file disimpan di satu folder, jadi bisa ditaruh di NAS.

## Yang sudah dipasang

| Aturan | Isi |
|---|---|
| Tahap 1–3 (Request, Alignment, Creative Brief) | Teritori CD. CD yang meneruskan ticket, atau mengembalikannya ke requester dengan alasan. |
| Tahap 4 (Production Setup) | Teritori AD. AD memilih PIC, production type, dan jumlah. |
| Tahap 5 (Production) | PIC hanya melihat ticket miliknya. Upload preview, lalu submit ke QC. |
| Tahap 6 (QC & Revision) | AD memutuskan lolos atau revisi. Empat jenis revisi: Brand issue, Creative issue, Brand alignment issue, Technical issue. |
| Tahap 7 (Final Approval) | CD dan Brand dua-duanya harus approve, urutan bebas. Ticket lanjut otomatis setelah file FA di-upload. |
| Tahap 8 (Output & Publish) | Brand mengisi jadwal publish dan menandai selesai. |
| Yang boleh bikin ticket | Requester Brand, Sales, Digital Marketing, dan CD. |
| Batas request | Kamis 15.00. Setelah itu masuk siklus minggu depan, atau diajukan urgent dan diputuskan CD. |
| SLA | Alignment Jumat 11.00, Creative Brief Jumat 16.00, Production Setup Jumat 17.00, QC 2 jam kerja, Final Approval 1 hari kerja. Produksi dihitung dari estimasi production type ditambah antrean PIC. |
| Jam kerja | Senin–Jumat 10.00–19.00, zona waktu Asia/Jakarta. |
| Ideal jam | 8 jam × 90% per orang per hari kerja. |
| Dashboard dan report | Hanya untuk Admin, CD, AD, dan Viewer. |
| Histori | 257 ticket dari TRACKER_CREATIVE_2026 diimpor otomatis saat pertama kali jalan. |

Semua angka aturan di atas ada di `src/lib/config.ts`. Ubah di sana, lalu build ulang.

## Menjalankan di komputer sendiri

Butuh Node.js 22 atau lebih baru, di komputer 64-bit (Windows, macOS, atau Linux).

```bash
npm install
npm run build
npm run start
```

Buka http://localhost:3000. Untuk mode pengembangan pakai `npm run dev`.

## Mode tanpa login (sementara)

Saat ini login dimatikan. Semua orang langsung masuk sebagai Admin, dan bisa pindah ke akun lain (CD, AD, PIC, requester) lewat tombol **Ganti akun** tanpa password. Untuk menyalakan login lagi, isi variabel `LOGIN_REQUIRED=true` lalu jalankan ulang aplikasi.

Di Vercel, database disimpan di `/tmp` dan **tidak permanen**: ticket, upload, dan perubahan bisa hilang kapan saja, dan tiap instance server bisa punya data berbeda. Pakai Vercel hanya untuk melihat-lihat. Untuk dipakai tim, jalankan di NAS.

## Akun awal

Dibuat otomatis saat database masih kosong. Password awal semuanya `trilogy-2026`, kecuali kalau dijalankan lewat `docker-compose.yml`: di sana password awalnya nilai `INITIAL_PASSWORD` di file itu (bisa diganti lewat variabel `INITIAL_PASSWORD` sebelum pertama kali dijalankan). Tiap akun wajib ganti password saat login pertama.

| Username | Peran |
|---|---|
| `admin` | Admin |
| `dewa` | Creative Director |
| `david` | Art Director (juga bisa jadi PIC) |
| `ilham`, `ryan`, `riziq` | Tim Produksi |
| `brand`, `sales`, `digital` | Requester per divisi (contoh, ganti dengan nama asli) |
| `bod` | Viewer, hanya lihat |

Tambah, ubah, nonaktifkan akun, dan reset password dari menu Admin. Requester dari divisi Brand otomatis menjadi pemberi approval Brand di tahap 7.

## Isi folder data

```
data/
  creative-ops.db          database
  backups/                 backup database otomatis tiap malam (14 hari terakhir)
  files/2026/00258-judul-ticket/
    1-referensi/
    2-preview/
    3-final-artwork/       file FA, termasuk file mentah design dan 3D
```

Folder `files` bisa dibuka langsung dari File Manager NAS. Jangan mengganti nama atau memindahkan file di dalamnya, karena database menyimpan jalurnya.

## Memasang di NAS

NAS-nya harus bisa menjalankan Docker (di Synology namanya Container Manager, di QNAP Container Station) dan ber-CPU 64-bit (Intel/AMD x64 atau ARM64). NAS ARM 32-bit tidak bisa.

1. Salin folder repo ini ke NAS.
2. Buat folder untuk data, misalnya `/volume1/creative-ops`.
3. Buka `docker-compose.yml`, sesuaikan jalur folder data, `INITIAL_PASSWORD`, `APP_URL`, `ALLOWED_ORIGINS`, dan `VAPID_SUBJECT`.
4. Jalankan `docker compose up -d --build` dari folder repo.
5. Buka `http://alamat-ip-nas:3000` dan login sebagai `admin`.

Jalankan hanya satu container. Reminder terjadwal berjalan di dalam proses aplikasi, jadi dua container akan mengirim reminder dobel ke database yang sama.

## Subdomain dan HTTPS

Push notif dan pemasangan ke layar HP hanya jalan lewat HTTPS, jadi langkah ini wajib sebelum dipakai tim.

1. Buat subdomain, misalnya `creative.domainkamu.com`, yang mengarah ke NAS. Caranya tergantung jaringan kantor: reverse proxy bawaan NAS dengan sertifikat HTTPS, atau layanan tunnel supaya tidak perlu membuka port router.
2. Arahkan subdomain itu ke port 3000 container.
3. Pastikan reverse proxy meneruskan header `Host` dan `X-Forwarded-Proto`, dan batas ukuran upload-nya dinaikkan (file video dan file mentah bisa beberapa GB).
4. Isi `APP_URL` dan `ALLOWED_ORIGINS` dengan subdomain itu, lalu jalankan ulang container. Kalau dua-duanya kosong atau salah, login lewat subdomain akan gagal dan halaman kembali ke form login tanpa pesan. Nilainya dibaca saat container jalan, jadi tidak perlu build ulang setelah mengubahnya.

## Push notif

Tiap orang menyalakannya sendiri di menu Akun & push notif, di tiap perangkat yang dipakai.

- Android dan laptop: buka web-nya, lalu klik tombol nyalakan.
- iPhone: buka di Safari, pilih Share lalu Add to Home Screen, buka dari ikonnya, baru nyalakan. Butuh iOS 16.4 atau lebih baru.

Notifikasi yang sama selalu masuk ke menu Notifikasi di dalam aplikasi, jadi tetap terbaca walau push tidak dinyalakan.

## Backup

- Otomatis: tiap malam database disalin ke `data/backups`, disimpan 14 hari.
- Manual: `npm run backup`.
- Backup ini berada di disk yang sama dengan aslinya. Untuk jaga-jaga kalau disk NAS rusak, salin folder `data` ke tempat lain secara rutin dengan fitur backup NAS.

## Yang belum dites

Dibangun dan dites lewat browser otomatis di satu komputer: login, seluruh alur ticket dari request sampai published dengan semua peran, upload file, hak akses, dan report. Yang belum:

- Build Docker dan jalan di NAS sungguhan.
- Pengiriman push notif ke perangkat nyata (butuh HTTPS dan HP asli).
- Upload file berukuran GB lewat reverse proxy.

Coba tiga hal itu dulu sebelum dipakai seluruh tim.

## Struktur kode

| Lokasi | Isi |
|---|---|
| `src/lib/config.ts` | Semua aturan: tahap, SLA, jam kerja, jenis revisi, peran |
| `src/lib/tickets.ts` | Hak akses dan perpindahan tahap |
| `src/lib/scheduler.ts` | Reminder terjadwal dan backup malam |
| `src/lib/reports.ts` | Hitungan Dashboard, Weekly AD, Monthly CD |
| `src/lib/db.ts` | Skema database dan data awal |
| `src/app/(app)/` | Halaman-halaman aplikasi |
| `src/app/api/` | Upload dan unduh file, notifikasi, push |
| `seed/tracker-2026.json` | Histori dari tracker lama |
