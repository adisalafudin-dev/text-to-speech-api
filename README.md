# Konteks Proyek: Otomatisasi YouTube Shorts "Edukasi Sehari"

> Dokumen serah-terima konteks untuk AI/asisten lain. Disusun dari seluruh percakapan sebelumnya (diperbarui 17 Okt 2026).
> Bahasa kerja pengguna: **Indonesia**. Jawaban yang disukai: langsung, bisa langsung dipraktikkan, tanpa basa-basi konseptual. Pengguna ingin **rencana dulu** sebelum membangun, kode diberikan **langsung di balasan** (bukan file patch), dan ia sendiri yang melakukan `git push`.

## 0. Ringkasan 30 detik

- **Tujuan:** pipeline otomatis di n8n yang membuat video YouTube Shorts (9:16) dari satu topik: naskah (Gemini) → suara (TTS Indonesia) → footage stok (Pixabay) → render FFmpeg dengan subtitle → file `.mp4`. **Upload ke YouTube dilakukan manual.**
- **Status:** seluruh rantai sudah menghasilkan video. Perbaikan subtitle (file ASS), prompt Gemini baru yang variatif, node `Pilih Topik`, node `Metadata`, dan kamus jargon baru **sudah diberikan tetapi belum dikonfirmasi berjalan di mesin pengguna**.
- **Kode server di bagian 5.1 sudah diuji end-to-end di sandbox** (upload 2 scene → finish → video 1080x1920 dengan subtitle terlihat), kecuali endpoint `/api/tts` yang butuh jaringan ke layanan Microsoft.
- Jangan menaruh API key di dokumen atau chat. Key Pixabay milik pengguna pernah tertulis di chat dan **harus di-rotate** (lihat bagian 9).

Contoh pembuka untuk AI lain:

> Baca dokumen konteks berikut dulu. Lanjutkan dari bagian "Status dan TODO". Jawab dalam bahasa Indonesia, ringkas, dengan kode lengkap yang bisa langsung ditempel.

## 1. Channel dan tujuan konten

- Channel: **Edukasi Sehari** (@EdukasiSehari), tagline "Pelajari hal baru di channel ini setiap hari".
- Video pertama sudah tayang manual: "Kenapa sih makan siang bikin ngantuk?" (thumbnail-nya menampilkan kucing, yaitu footage kurang relevan dengan topik; relevansi footage perlu dipantau).
- Niche awal yang dipilih pengguna: fakta unik sains dan teknologi; lalu melebar ke edukasi sehari-hari. Target: topik variatif, informatif, berpotensi FYP.
- Format naskah: Hook → Penjelasan → Kesimpulan, 5–6 scene, sekitar 45 detik.

## 2. Lingkungan dan jaringan

| Komponen            | Detail                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| n8n                 | Docker lewat **CasaOS** di STB Armbian, versi 2.42.5, `http://192.168.1.21:5678`                                                               |
| Server TTS + render | Express (ESM) di **laptop Windows** terpisah, `http://192.168.1.13:3000` (di screenshot lama IP-nya `192.168.1.8`, jadi pastikan IP saat ini)  |
| Jalankan server     | Git Bash/PowerShell di laptop, `npm run start` (`node server.js`)                                                                              |
| FFmpeg              | Dipasang lewat `winget install Gyan.FFmpeg`, executable di `C:\Users\<USER>\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe` dan `ffprobe.exe` |
| Penyimpanan hasil   | Rencana: mount `/files` di container n8n (belum dikonfirmasi diterapkan)                                                                       |

Pengguna: mahasiswa Informatika, nyaman dengan Node.js, Docker, dan n8n dasar; stack utama NestJS/React; punya home server dan Cloudflare Tunnel.

**Perintah start server (Windows)**, karena Git Bash pengguna tidak mewarisi PATH baru setelah install FFmpeg:

Git Bash (satu baris):

```bash
FFMPEG_PATH='C:\Users\<USER>\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe' FFPROBE_PATH='C:\Users\<USER>\AppData\Local\Microsoft\WinGet\Links\ffprobe.exe' npm run start
```

PowerShell:

```powershell
$env:FFMPEG_PATH="C:\Users\<USER>\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe"
$env:FFPROBE_PATH="C:\Users\<USER>\AppData\Local\Microsoft\WinGet\Links\ffprobe.exe"
npm run start
```

Pengganti: tutup semua terminal/VS Code lalu buka baru, supaya PATH baru terbaca.

**Docker n8n (compose CasaOS)**: yang sudah ada `GENERIC_TIMEZONE`, `N8N_HOST=0.0.0.0`, `N8N_PORT=5678`, `N8N_PROTOCOL=http`, `N8N_SECURE_COOKIE=false`, bind mount `n8n_data` ke `/home/node/.n8n`, `memory limit 1920M`. `WEBHOOK_URL=http://192.168.21:5678/` kemungkinan typo (`192.168.1.21`). Perubahan yang **disarankan** (belum dikonfirmasi):

```yaml
environment:
  - N8N_RESTRICT_FILE_ACCESS_TO=/files
  - N8N_DEFAULT_BINARY_DATA_MODE=filesystem
volumes:
  - type: bind
    source: /media/devmon/sda1-ata-ST500LT012-9WS14/tts-output
    target: /files
```

Folder host perlu `chown -R 1000:1000`. Container harus di-_recreate_ (`docker compose up -d`), bukan `docker restart`.

## 3. Arsitektur dan alur

```
Trigger
  → Pilih Topik (Code)            [baru, belum dikonfirmasi dipasang]
  → Message a model (Gemini)      naskah JSON
  → Code in JavaScript            parse JSON → 1 item per scene (+ job_id)
  → TTS (HTTP Request)            POST /api/tts → mp3 per scene
  → Pixabay Primary (HTTP)        cari footage dari search_query
  → [Pixabay Fallback]            BELUM dibuat; query cadangan
  → Code in JavaScript1           = "Pick Video": pilih satu klip per scene
  → HTTP Request                  = "Footage": unduh mp4 (binary `video`)
  → Code in JavaScript2           = "Attach Audio": gabung binary video + audio
  → Upload Scene (HTTP)           POST multipart per scene ke server render
  → Finish (HTTP, Execute Once)   POST render → mp4 final (binary `video`)
        ├→ Write File to Disk     [belum dikonfirmasi]
        └→ Metadata (Code)        judul/deskripsi/kredit siap tempel [baru]
```

Nama node pada workflow pengguna: parse = `Code in JavaScript`, Pick Video = `Code in JavaScript1`, Footage = `HTTP Request`, Attach Audio = `Code in JavaScript2`. Kode Code-node merujuk nama-nama ini lewat `$('Nama Node')`, jadi harus cocok.

Server render dipisah dua endpoint karena HTTP Request n8n punya jumlah field form-data yang tetap: upload per scene, lalu `finish`.

## 4. Konfigurasi node n8n

**Message a model (Gemini):** prompt dalam mode Expression (lihat 5.6). Model teks, bukan model gambar.

**Code in JavaScript (parse):** kode di 5.3. Output per scene: `job_id, title, scene_number, narration, search_query, fallback_query`. `job_id` dibuat sekali per run.

**TTS (HTTP Request):** `POST http://192.168.1.13:3000/api/tts`, Body JSON (mode Expression):

```
{{ JSON.stringify({ text: $json.narration, voice: "id-ID-ArdiNeural" }) }}
```

Options → Batching: 1 item per batch, interval 1500 ms. Response Format: File, field `data`. Jangan ada tanda `=` nyasar di dalam teks dan jangan kirim `model_id` (sisa API ElevenLabs).

**Pixabay Primary (HTTP Request):** `GET https://pixabay.com/api/videos/`. Query: `key` (lebih baik lewat credential Query Auth, Name `key`), `q` = `{{ $('Code in JavaScript').item.json.search_query }}`, `video_type=film`, `per_page=20`, `safesearch=true`, opsional `min_height=1080`. Matikan **Include Response Headers and Status** (kalau menyala, data terbungkus di `body`). Batching 1 item / 500 ms, Retry On Fail 2. Parameter `orientation` **tidak berlaku untuk video** Pixabay: hasil hampir semuanya landscape dan di-crop tengah ke 9:16 di server. Limit Pixabay: 100 request per 60 detik.

**Pixabay Fallback (belum dibuat):** duplikat Pixabay Primary, ganti `q` ke `fallback_query`, sambung setelah Primary. Tanpa node ini, `Code in JavaScript1` membaca output Primary dua kali (tetap jalan, tanpa cadangan query).

**Pick Video (`Code in JavaScript1`):** kode di 5.4.

**Footage (`HTTP Request`):** `GET {{ $json.video_url }}`, tanpa credential, Response Format File, Put Output in Field `video`, batching 1 / 500 ms, timeout 180000, Retry On Fail 2. File Pixabay 1080p bisa belasan sampai puluhan MB.

**Attach Audio (`Code in JavaScript2`):** kode di 5.5.

**Upload Scene (HTTP Request):**

- `POST http://192.168.1.13:3000/api/render/{{ $('Code in JavaScript').item.json.job_id }}/scenes/{{ $('Code in JavaScript').item.json.scene_number }}` (mode **Expression**, diketik tangan)
- Body Content Type `Form-Data`, tiga parameter (nama selalu mode **Fixed**): `narration` (Form Data, `{{ $('Code in JavaScript').item.json.narration }}`), `audio` (n8n Binary File, field `audio`), `video` (n8n Binary File, field `video`).
- Respons sukses: `{"ok":true,"scene":N}`.

**Finish (HTTP Request):**

- `POST http://192.168.1.13:3000/api/render/{{ $('Code in JavaScript').first().json.job_id }}/finish`
- Body JSON: `{ "subtitles": true }` (Specify Body: Using JSON, bukan "Using Fields Below", supaya boolean tidak menjadi string)
- Settings: **Execute Once** aktif, Retry On Fail mati. Options: Response Format File, field `video`, Timeout `900000`.

**Write File to Disk:** Input Binary Field `video`, path `/files/short-{{ $('Code in JavaScript').first().json.job_id }}.mp4` (butuh mount `/files`).

**Metadata (Code, cabang dari Finish):** kode di 5.7.

## 5. Kode referensi

### 5.1 `server.js` (versi final, sudah diuji)

Struktur proyek: `server.js`, `src/controllers/tts.controller.js` (berisi `validateTTSRequest`), `src/utils/preprocess.js`. Dependensi: `express`, `msedge-tts`, `multer`. `package.json` memakai `"type": "module"`.

```javascript
import express from "express";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { validateTTSRequest } from "./src/controllers/tts.controller.js";
import { preprocessText } from "./src/utils/preprocess.js";

const execFileAsync = promisify(execFile);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TMP_DIR = path.join(__dirname, "tmp");

// Pastikan direktori penyimpanan tersedia.
fs.mkdirSync(TMP_DIR, { recursive: true });

app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));

// ==================================================
// 1. ENDPOINT TTS
// ==================================================

app.post("/api/tts", validateTTSRequest, async (req, res) => {
  const { text, voice } = req.ttsInput;

  const requestId = randomUUID();
  // Folder per request: msedge-tts selalu menulis ke "audio.mp3",
  // jadi tiap request butuh foldernya sendiri agar tidak saling menimpa.
  const requestDir = path.join(TMP_DIR, `tts-${requestId}`);

  const cleanup = () =>
    fs.rm(requestDir, { recursive: true, force: true }, (e) => {
      if (e) console.error(`[${requestId}] Cleanup gagal:`, e.message);
    });

  try {
    fs.mkdirSync(requestDir, { recursive: true });

    const processedText = preprocessText(text);

    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const { audioFilePath } = await tts.toFile(requestDir, processedText);

    if (!audioFilePath || !fs.existsSync(audioFilePath)) {
      throw new Error("File audio tidak berhasil dibuat.");
    }

    if (
      path.dirname(path.resolve(audioFilePath)) !== path.resolve(requestDir)
    ) {
      throw new Error("Lokasi file audio tidak valid.");
    }

    res.download(audioFilePath, `speech-${requestId}.mp3`, (err) => {
      cleanup();

      if (err) {
        console.error(`[${requestId}] Pengiriman gagal:`, err.message);
        if (!res.headersSent && !res.destroyed) {
          res.status(500).json({ error: "Gagal mengirim file audio." });
        }
      }
    });
  } catch (error) {
    console.error(`[${requestId}] TTS gagal:`, error.message);
    cleanup();

    if (!res.headersSent && !res.destroyed) {
      res.status(500).json({ error: "Gagal menghasilkan audio TTS." });
    }
  }
});

// ==================================================
// 2. HEALTH CHECK
// ==================================================

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "custom-tts-api",
  });
});

// ==================================================
// 3. RENDER VIDEO (YouTube Shorts 9:16, footage video)
// ==================================================

// Path executable bisa dioverride lewat env jika PATH terminal tidak terbaca.
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

// Font subtitle: file disalin ke folder job, nama keluarga harus cocok.
const FONT_FILE = process.env.FONT_FILE || "C:/Windows/Fonts/arialbd.ttf";
const FONT_NAME = process.env.FONT_NAME || "Arial";

const VIDEO_W = 1080;
const VIDEO_H = 1920;
const FPS = 30;
const MAX_SCENES = 20;
const JOB_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

// Render dijalankan satu per satu supaya mesin tidak kewalahan.
let renderQueue = Promise.resolve();
function enqueue(task) {
  const run = renderQueue.then(task, task);
  renderQueue = run.catch(() => {});
  return run;
}

function validateJobParams(req, res, next) {
  const { jobId, n } = req.params;

  if (!JOB_ID_RE.test(jobId)) {
    return res.status(400).json({ error: "jobId tidak valid." });
  }

  if (n !== undefined) {
    const num = Number(n);
    if (!Number.isInteger(num) || num < 1 || num > MAX_SCENES) {
      return res.status(400).json({ error: "Nomor scene tidak valid." });
    }
  }

  req.jobDir = path.join(TMP_DIR, `job-${jobId}`);
  next();
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      fs.mkdirSync(req.jobDir, { recursive: true });
      cb(null, req.jobDir);
    },
    filename: (req, file, cb) => {
      const ext = path
        .extname(file.originalname)
        .toLowerCase()
        .replace(/[^.a-z0-9]/g, "");
      cb(null, `${file.fieldname}-${req.params.n}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) =>
    cb(null, file.fieldname === "audio" || file.fieldname === "video"),
  limits: { fileSize: 200 * 1024 * 1024, files: 2 },
}).fields([
  { name: "audio", maxCount: 1 },
  { name: "video", maxCount: 1 },
]);

async function getDuration(file, cwd) {
  const { stdout } = await execFileAsync(
    FFPROBE,
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nw=1:nk=1",
      file,
    ],
    { cwd },
  );
  const d = parseFloat(stdout);
  if (!Number.isFinite(d) || d <= 0) {
    throw new Error(`Durasi audio tidak valid: ${file}`);
  }
  return d;
}

// Format waktu ASS: h:mm:ss.cc
function toAssTime(sec) {
  const cs = Math.round(sec * 100);
  const h = Math.floor(cs / 360000);
  const m = Math.floor(cs / 6000) % 60;
  const s = Math.floor(cs / 100) % 60;
  const c = cs % 100;
  const p = (v) => String(v).padStart(2, "0");
  return `${h}:${p(m)}:${p(s)}.${p(c)}`;
}

// Subtitle dibuat sebagai file ASS dengan kanvas 1080x1920, sehingga
// ukuran font dan margin berarti piksel sebenarnya. (Kalau memakai SRT,
// ffmpeg memakai kanvas default 384x288 dan teks jadi raksasa/di luar layar.)
function buildAss(narration, duration, wordsPerCue = 5) {
  const words = narration
    .replace(/[{}\\]/g, "") // karakter khusus ASS
    .replace(/\s+/g, " ")
    .trim()
    .split(" ");

  const chunks = [];
  for (let i = 0; i < words.length; i += wordsPerCue) {
    chunks.push(words.slice(i, i + wordsPerCue).join(" "));
  }

  const totalChars = chunks.reduce((sum, c) => sum + c.length, 0) || 1;
  let t = 0;

  const events = chunks.map((chunk) => {
    const start = t;
    t += (duration * chunk.length) / totalChars;
    return `Dialogue: 0,${toAssTime(start)},${toAssTime(t)},Default,,0,0,0,,${chunk}`;
  });

  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${VIDEO_W}
PlayResY: ${VIDEO_H}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${FONT_NAME},64,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,4,0,2,60,60,380,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join("\n")}
`;
}

async function renderScene(dir, scene, burnSubtitles) {
  const duration = await getDuration(scene.audio, dir);
  const out = `clip-${scene.n}.mp4`;

  const filters = [
    `fps=${FPS}`,
    `scale=${VIDEO_W}:${VIDEO_H}:force_original_aspect_ratio=increase`,
    `crop=${VIDEO_W}:${VIDEO_H}`,
    "setsar=1",
  ];

  const withSubtitles = burnSubtitles && scene.narration;
  console.log(
    `[scene ${scene.n}] subtitle: ${withSubtitles ? "ON" : "OFF"}, panjang narasi: ${scene.narration?.length ?? 0}`,
  );

  if (withSubtitles) {
    const assName = `scene-${scene.n}.ass`;
    fs.writeFileSync(
      path.join(dir, assName),
      buildAss(scene.narration, duration),
    );

    // Font di subfolder khusus, supaya libass tidak mencoba memuat mp4/mp3.
    const fontDir = path.join(dir, "fonts");
    fs.mkdirSync(fontDir, { recursive: true });
    if (fs.existsSync(FONT_FILE)) {
      fs.copyFileSync(FONT_FILE, path.join(fontDir, "subtitle-font.ttf"));
    } else {
      console.warn(`FONT_FILE tidak ditemukan: ${FONT_FILE}`);
    }

    filters.push(`ass=${assName}:fontsdir=fonts`);
  }

  const { stderr } = await execFileAsync(
    FFMPEG,
    [
      "-hide_banner",
      "-loglevel",
      "warning",
      "-nostats",
      "-y",
      "-stream_loop",
      "-1",
      "-i",
      scene.video, // loop jika footage lebih pendek dari suara
      "-i",
      scene.audio,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0", // suara asli footage dibuang
      "-vf",
      filters.join(","),
      "-t",
      duration.toFixed(3),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-r",
      String(FPS),
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      out,
    ],
    { cwd: dir },
  );

  if (stderr) console.warn(`[scene ${scene.n}] ffmpeg:`, stderr.slice(0, 500));

  return out;
}

async function renderJob(dir, scenes, burnSubtitles) {
  const clips = [];
  for (const scene of scenes) {
    clips.push(await renderScene(dir, scene, burnSubtitles));
  }

  fs.writeFileSync(
    path.join(dir, "list.txt"),
    clips.map((c) => `file '${c}'`).join("\n"),
  );

  await execFileAsync(
    FFMPEG,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostats",
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      "list.txt",
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      "final.mp4",
    ],
    { cwd: dir },
  );

  return path.join(dir, "final.mp4");
}

// ---------- endpoint render ----------

// Upload audio + video footage untuk satu scene (multipart).
app.post(
  "/api/render/:jobId/scenes/:n",
  validateJobParams,
  upload,
  (req, res) => {
    const audio = req.files?.audio?.[0];
    const video = req.files?.video?.[0];
    const narration =
      typeof req.body?.narration === "string" ? req.body.narration.trim() : "";

    if (!audio || !video) {
      return res
        .status(400)
        .json({ error: "Field 'audio' dan 'video' wajib diisi." });
    }

    const n = Number(req.params.n);
    fs.writeFileSync(
      path.join(req.jobDir, `scene-${n}.json`),
      JSON.stringify({
        n,
        audio: audio.filename,
        video: video.filename,
        narration,
      }),
    );

    res.json({ ok: true, scene: n });
  },
);

// Render semua scene yang sudah diupload, lalu kirim final.mp4.
app.post("/api/render/:jobId/finish", validateJobParams, async (req, res) => {
  const { jobId } = req.params;
  const dir = req.jobDir;
  const burnSubtitles = req.body?.subtitles !== false;
  const cleanup = () => fs.rm(dir, { recursive: true, force: true }, () => {});

  try {
    if (!fs.existsSync(dir)) {
      return res.status(404).json({ error: "Job tidak ditemukan." });
    }

    const scenes = fs
      .readdirSync(dir)
      .filter((f) => /^scene-\d+\.json$/.test(f))
      .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")))
      .sort((a, b) => a.n - b.n);

    if (scenes.length === 0) {
      return res.status(400).json({ error: "Belum ada scene yang diupload." });
    }

    console.log(`[${jobId}] Render ${scenes.length} scene...`);
    const finalPath = await enqueue(() =>
      renderJob(dir, scenes, burnSubtitles),
    );

    res.download(finalPath, `short-${jobId}.mp4`, (err) => {
      cleanup();
      if (err) console.error(`[${jobId}] Pengiriman gagal:`, err.message);
    });
  } catch (error) {
    console.error(`[${jobId}] Render gagal:`, error.stderr || error.message);
    // Saat debugging, komentari cleanup() agar folder job tidak terhapus.
    cleanup();
    if (!res.headersSent) {
      res.status(500).json({ error: "Gagal merender video." });
    }
  }
});

// Bersihkan folder job/tts yang ditinggalkan (lebih dari 1 jam).
setInterval(
  () => {
    for (const name of fs.readdirSync(TMP_DIR)) {
      if (!/^(job|tts)-/.test(name)) continue;
      const p = path.join(TMP_DIR, name);
      try {
        if (Date.now() - fs.statSync(p).mtimeMs > 60 * 60 * 1000) {
          fs.rmSync(p, { recursive: true, force: true });
        }
      } catch {}
    }
  },
  10 * 60 * 1000,
).unref();

// ==================================================
// 4. ERROR HANDLER
// ==================================================

app.use((err, _req, res, _next) => {
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ error: "Payload JSON tidak valid." });
  }

  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload gagal: ${err.message}` });
  }

  console.error(err);

  if (!res.headersSent) {
    res.status(500).json({ error: "Internal server error." });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`TTS API berjalan di port ${PORT}`);
});
```

Catatan perilaku yang terbukti di uji:

- `/api/render/:jobId/scenes/:n` menolak field selain `audio` dan `video` (`Unexpected file field`), dan menjawab 400 jika salah satunya kurang.
- Hasil render: 1080x1920, durasi = jumlah durasi audio, subtitle tergambar di y≈1488–1538 (sepertiga bawah).
- Folder `job-*` dihapus setelah Finish dan setelah Finish gagal. Menjalankan Finish lagi **tepat setelah** sukses bisa menjawab 500 (bukan 404) selama pembersihan belum selesai; setelah itu 404.
- Saat debugging, komentari `cleanup()` di blok `catch` endpoint `finish` supaya folder job bisa diperiksa.

### 5.2 `src/utils/preprocess.js` (kamus jargon TTS)

Hanya mengubah audio; subtitle tetap memakai narasi asli. Pencocokan **tidak peka huruf besar-kecil** dan hanya untuk kata utuh (jadi kata `ai` kecil ikut berubah). Ejaan di bawah adalah tebakan awal untuk `id-ID-ArdiNeural` dan **belum didengarkan**; sesuaikan dengan telinga.

```javascript
const JARGON_DICTIONARY = {
  // yang sudah ada
  ESP32: "i es pi tiga dua",
  Termux: "termuks",
  backend: "bek-end",
  "Node.js": "not ji-es",

  // astronomi dan fisika
  "black hole": "blek houl",
  "accretion disk": "akresi disk",
  quantum: "kuantum",
  laser: "leiser",
  NASA: "nasa",
  DNA: "de en a",

  // teknologi
  LED: "el i di",
  AI: "ei ai",
  CPU: "si pi yu",
  GPU: "ji pi yu",
  SSD: "es es di",
  USB: "yu es bi",
  GPS: "ji pi es",
  IoT: "ai o ti",
  WiFi: "wai fai",
  "fiber optic": "faiber optik",
  "5G": "lima ji",
  HTTP: "ha te te pe",
};

export function preprocessText(text) {
  // Cocokkan istilah terpanjang terlebih dahulu.
  const terms = Object.keys(JARGON_DICTIONARY).sort(
    (a, b) => b.length - a.length,
  );

  if (terms.length === 0) return text;

  const escapedTerms = terms.map((term) =>
    term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );

  // Case-insensitive, tetapi hanya mengganti istilah utuh.
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${escapedTerms.join("|")})(?![\\p{L}\\p{N}])`,
    "giu",
  );

  return text.replace(pattern, (match) => {
    const key = terms.find(
      (term) => term.toLowerCase() === match.toLowerCase(),
    );

    return key ? JARGON_DICTIONARY[key] : match;
  });
}
```

### 5.3 Node parse (`Code in JavaScript`)

```javascript
const parts = $input.first().json.content?.parts ?? [];
const rawText = parts.map((p) => p.text ?? "").join("");

// Ambil blok JSON saja
const start = rawText.indexOf("{");
const end = rawText.lastIndexOf("}");
if (start === -1 || end === -1) {
  throw new Error("Respons Gemini tidak berisi JSON: " + rawText.slice(0, 200));
}

const data = JSON.parse(rawText.slice(start, end + 1));

const missing = data.scenes.filter((s) => !s.search_query || !s.fallback_query);
if (missing.length) {
  throw new Error(
    `Scene ${missing.map((s) => s.scene_number).join(", ")} tidak punya search_query/fallback_query. ` +
      `Field yang diterima Gemini: ${Object.keys(data.scenes[0]).join(", ")}`,
  );
}

// Riwayat topik untuk menghindari pengulangan. Hanya tersimpan saat workflow
// berjalan lewat trigger di workflow yang dipublish (bukan Execute workflow manual).
const sd = $getWorkflowStaticData("global");
sd.history = [...(sd.history ?? []), data.topic || data.title].slice(-40);

const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

return data.scenes.map((scene) => ({
  json: {
    job_id: jobId,
    title: data.title,
    scene_number: scene.scene_number,
    narration: scene.narration,
    search_query: scene.search_query,
    fallback_query: scene.fallback_query,
  },
}));
```

### 5.4 Pick Video (`Code in JavaScript1`, Run Once for All Items)

```javascript
const scenes = $("Code in JavaScript")
  .all()
  .map((i) => i.json);
const primary = $("Pixabay Primary").all();
const fallback = $input.all();
const used = new Set();

const hitsOf = (r) => r?.json.hits ?? r?.json.body?.hits ?? [];

// Ambil file terkecil dengan sisi terpendek >= 1080; kalau tidak ada, yang terbesar.
function pickFile(hit) {
  const vids = Object.values(hit.videos ?? {}).filter(
    (v) => v.url && v.width && v.height,
  );
  const hd = vids
    .filter((v) => Math.min(v.width, v.height) >= 1080)
    .sort((a, b) => a.height - b.height);
  return hd[0] ?? vids.sort((a, b) => b.height - a.height)[0];
}

return scenes.map((s, i) => {
  // Perkiraan durasi suara; server me-loop klip jika footage lebih pendek.
  const estimate = Math.max(4, s.narration.trim().split(/\s+/).length / 2.3);

  const candidates = [...hitsOf(primary[i]), ...hitsOf(fallback[i])].filter(
    (h) => !h.isAiGenerated && pickFile(h),
  );

  const fresh = candidates.filter((h) => !used.has(h.id));
  const hit =
    fresh.find((h) => h.duration >= estimate) ?? fresh[0] ?? candidates[0];

  if (!hit) {
    throw new Error(
      `Scene ${s.scene_number}: Pixabay tidak menemukan footage untuk ` +
        `"${s.search_query}" / "${s.fallback_query}". Ubah query di prompt Gemini.`,
    );
  }

  used.add(hit.id);
  const file = pickFile(hit);

  return {
    json: {
      scene_number: s.scene_number,
      video_url: file.url,
      video_id: hit.id,
      credit: `Video by ${hit.user} on Pixabay: ${hit.pageURL}`,
    },
    pairedItem: { item: i },
  };
});
```

Struktur respons Pixabay: `hits[].videos.{large,medium,small,tiny}.{url,width,height,size}`, plus `id, pageURL, duration, user, isAiGenerated`.

### 5.5 Attach Audio (`Code in JavaScript2`, Run Once for All Items)

```javascript
const audio = $("TTS").all();

return $input.all().map((item, i) => ({
  json: {},
  binary: {
    video: item.binary.video,
    audio: audio[i].binary.data,
  },
  pairedItem: { item: i },
}));
```

### 5.6 Node `Pilih Topik` (Code) dan prompt Gemini

Node `Pilih Topik` (sebelum Gemini, Run Once for All Items):

```javascript
const categories = [
  "Tubuh manusia sehari-hari (tidur, makan, refleks, panca indra)",
  "Makanan dan dapur (memasak, bahan makanan, rasa)",
  "Cuaca dan alam (hujan, petir, pelangi, laut, gunung)",
  "Benda di rumah (kulkas, kaca, magnet, listrik, air)",
  "Teknologi sehari-hari (HP, baterai, WiFi, layar)",
  "Hewan dan tumbuhan",
  "Kebiasaan dan cara kerja otak sehari-hari",
  "Bumi dan antariksa (matahari, bulan, bintang)",
  "Asal-usul benda atau kebiasaan sehari-hari",
];

const angles = [
  "Kenapa sih ... terjadi?",
  "Mitos vs fakta",
  "Yang sebenarnya terjadi saat ...",
  "Kesalahan umum yang sering dilakukan orang",
  "Tiga fakta mengejutkan tentang ...",
  "Bagaimana cara kerja ... ?",
];

const hooks = [
  "pertanyaan yang memancing penasaran",
  "pernyataan mengejutkan",
  "membongkar mitos yang dipercaya banyak orang",
  'skenario "bayangkan kalau ..."',
  "situasi sehari-hari yang dialami semua orang",
];

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const history = ($getWorkflowStaticData("global").history ?? []).slice(-30);

return [
  {
    json: {
      category: pick(categories),
      angle: pick(angles),
      hook_style: pick(hooks),
      avoid: history.length ? history.join("; ") : "(belum ada)",
    },
  },
];
```

Prompt di node `Message a model` (kolom prompt harus mode Expression):

```
Kamu penulis naskah YouTube Shorts berbahasa Indonesia untuk channel "Edukasi Sehari" (tagline: pelajari hal baru setiap hari). Penonton: umum, usia 15-40, suka fakta singkat yang membuat mereka berkata "oh iya ya".

TUGAS: buat satu naskah sekitar 45 detik.
Kategori: {{ $json.category }}
Sudut pandang: {{ $json.angle }}
Gaya hook: {{ $json.hook_style }}
Pilih SATU topik yang spesifik dan menarik di dalam kategori itu, bukan topik umum.
JANGAN mengulang topik berikut: {{ $json.avoid }}

STRUKTUR (5-6 scene):
- Scene 1 (hook): maksimal 15 kata. Kalimat pertama harus memancing penasaran dalam 2 detik. Jangan mulai dengan "Tahukah kamu", "Pernahkah kamu", atau sapaan.
- Scene tengah (penjelasan): satu ide per scene, urut dari sebab ke akibat, pakai contoh dari kehidupan sehari-hari.
- Scene terakhir: kesimpulan satu kalimat, lalu satu pertanyaan ringan agar penonton mau berkomentar. Jangan menulis "jangan lupa subscribe".

ATURAN ISI:
- Fakta harus sudah mapan dan benar. Kalau tidak yakin, pilih topik lain.
- Jangan membuat klaim medis, diagnosis, atau janji kesembuhan. Gunakan kata seperti "umumnya" atau "salah satu penyebabnya".
- Jangan clickbait yang menyesatkan. Judul harus sesuai isi video.

ATURAN PENULISAN UNTUK SUARA:
- 15-25 kata per scene, kalimat pendek.
- Tanpa emoji, tanda kurung, atau tanda kutip berlebihan.
- Tulis angka kecil dengan huruf ("dua liter"). Hindari singkatan dan istilah Inggris kecuali perlu.

Balas HANYA dengan JSON valid, tanpa teks lain dan tanpa markdown:
{
  "title": "maksimal 60 karakter, berbentuk pertanyaan atau pernyataan yang memancing penasaran, tanpa hashtag",
  "topic": "inti topik dalam 3-6 kata",
  "scenes": [
    {
      "scene_number": 1,
      "narration": "teks suara dalam bahasa Indonesia",
      "search_query": "2-3 kata Inggris",
      "fallback_query": "2 kata Inggris yang lebih umum"
    }
  ]
}

Setiap scene WAJIB memiliki tepat 4 field: scene_number, narration, search_query, fallback_query. Jangan menambahkan field lain.

ATURAN search_query dan fallback_query:
- Bahasa Inggris, 2-3 kata, berupa benda, tempat, atau aksi yang bisa direkam kamera.
- Pilih visual yang umum difilmkan: dapur, makanan, rumah, orang beraktivitas, alam, langit, kota, hewan.
- Hindari kata abstrak ("concept", "innovation", "future"), merek, dan nama orang.
- Kalau topiknya tidak bisa difilmkan langsung, pakai visual pendukung (contoh: otak lelah -> "sleepy man desk", "yawning").
- fallback_query harus umum dan hampir pasti ada footage-nya (contoh: "night sky", "kitchen cooking", "city street").
```

Tidak ada prompt yang bisa menjamin viral. Yang realistis: hook kuat di 2 detik pertama, satu ide per video, akhir yang memancing komentar, topik tidak berulang, lalu pantau retensi di YouTube Studio.

### 5.7 Node `Metadata` (Code, cabang dari Finish, Run Once for All Items)

```javascript
const scenes = $("Code in JavaScript")
  .all()
  .map((i) => i.json);
const picks = $("Code in JavaScript1")
  .all()
  .map((i) => i.json); // node Pick Video

const title = scenes[0].title;
const credits = [...new Set(picks.map((p) => p.credit))];

return [
  {
    json: {
      job_id: scenes[0].job_id,
      youtube_title: `${title} #Shorts`.slice(0, 100),
      youtube_description: [
        scenes[0].narration,
        "",
        "#Shorts #sains #teknologi #faktaunik",
        "",
        "Footage:",
        ...credits,
      ].join("\n"),
    },
  },
];
```

## 6. Keputusan penting dan alasannya

| Keputusan                                                       | Alasan                                                                                                                                                                                                                          |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visual = **footage stok (Pixabay)**, bukan generasi gambar      | Model gambar Gemini (`gemini-3.1-flash-image`) memberi `429 ... limit: 0`: tidak tersedia di tier gratis project pengguna. Menunggu tidak membantu. Pollinations/Cloudflare Workers AI/Pexels sempat dibahas sebagai alternatif |
| **Tidak** scraping video dari YouTube/TikTok                    | Melanggar ToS/hak cipta; risiko copyright claim dan demonetisasi                                                                                                                                                                |
| Pixabay (bukan Pexels)                                          | Pengguna sudah punya key Pixabay; Pexels punya filter portrait asli, bisa jadi hybrid di masa depan                                                                                                                             |
| Footage landscape di-crop tengah ke 9:16                        | Pixabay tidak punya filter orientasi untuk video; alternatif (blur-background atau hybrid Pexels) ditawarkan, belum dipilih                                                                                                     |
| Render FFmpeg di **server terpisah (laptop)**, bukan di n8n/STB | Container n8n tidak punya FFmpeg, Execute Command dinonaktifkan di n8n baru, STB terlalu lemah                                                                                                                                  |
| Upload multipart dipecah: `scenes/:n` lalu `finish`             | HTTP Request n8n punya field form-data tetap; tidak praktis kirim N scene dalam satu request                                                                                                                                    |
| Subtitle = file **ASS** dengan `PlayRes 1080x1920`              | SRT dikonversi ffmpeg ke kanvas 384x288, sehingga `FontSize=64` dan `MarginV=380` diskalakan ~6,7x: teks raksasa dan di luar layar, tanpa error. Terverifikasi di sandbox                                                       |
| TTS: folder per request (`tmp/tts-<uuid>/`)                     | `msedge-tts` selalu menulis `audio.mp3` di folder tujuan: tanpa folder unik, request paralel saling menimpa                                                                                                                     |
| Upload ke YouTube **manual**                                    | Pengguna memilih sendiri. API v3 dibahas tetapi tidak dipakai (lihat 8)                                                                                                                                                         |

## 7. Riwayat error dan perbaikannya

| Gejala                                                                  | Penyebab                                                                                | Perbaikan                                                                                                                                                                           |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nama file selalu `audio.mp3` di `tmp/`                                  | `msedge-tts` memberi nama tetap; `speech-<uuid>.mp3` hanya header `Content-Disposition` | Folder per request, `cleanup()` di callback download                                                                                                                                |
| File di sisi n8n tertimpa                                               | Nama file tetap di node tulis                                                           | Nama dinamis (`{{ $execution.id }}` atau `job_id`)                                                                                                                                  |
| `TTS gagal: preprocessText is not defined`                              | Fungsi ikut terhapus saat validator dipindah ke `controllers`                           | `src/utils/preprocess.js` + import                                                                                                                                                  |
| `cleanup()` menghapus seluruh `tmp/`                                    | `requestDir = path.join(TMP_DIR)` menunjuk folder utama                                 | `requestDir = tmp/tts-<uuid>`                                                                                                                                                       |
| `Edge TTS WebSocket error: 403`                                         | Dugaan: versi `msedge-tts` usang / token Microsoft                                      | Disarankan: `npm i msedge-tts@latest`, cek jam sistem, VPN (TTS kemudian berhasil, penyebab pasti tidak dikonfirmasi)                                                               |
| 500 dari TTS saat body punya `"=..."`                                   | `=` nyasar dan `model_id` sisa ElevenLabs                                               | Body bersih `{ text, voice }`                                                                                                                                                       |
| `hits` kosong di Pick Video                                             | Include Response Headers menyala, data di `body.hits`                                   | Matikan opsi itu; kode juga membaca `body.hits`                                                                                                                                     |
| Output Code tanpa `search_query`                                        | Gemini masih memakai skema lama (`image_prompt`)                                        | Ganti prompt lengkap, jalankan ulang node Gemini (unpin), tambah validasi di Code node                                                                                              |
| `Cannot read properties of undefined (reading 'value')` di Upload Scene | URL ter-encode oleh Import cURL; nama parameter `=narration` dalam mode expression      | Ketik URL manual di mode Expression; nama parameter Fixed; buat ulang parameter                                                                                                     |
| `400 Upload gagal: Unexpected file field`                               | Server masih versi gambar (menerima `image`, bukan `video`)                             | Ganti `upload`, endpoint scene, dan `renderScene` ke versi video; limit 200 MB (file 27 MB ditolak di 25 MB)                                                                        |
| Finish: `jobId tidak valid`                                             | Expression `{{{('Code...` tanpa `$`                                                     | `{{ $('Code in JavaScript').first().json.job_id }}`                                                                                                                                 |
| Finish: 404 `Job tidak ditemukan`                                       | Folder job dihapus `cleanup()` setelah render gagal                                     | Jalankan ulang Upload Scene lalu Finish; jangan jalankan ulang node parse (job_id berubah)                                                                                          |
| `spawn ffprobe ENOENT` / `spawn ffmpeg ENOENT`                          | Git Bash/VS Code dibuka sebelum install; PATH tidak diwarisi                            | Terminal baru, atau `FFMPEG_PATH`/`FFPROBE_PATH`; ganti **semua** `"ffmpeg"`/`"ffprobe"` di kode ke konstanta. Sempat tertulis literal `C:/.../` (contoh placeholder ikut terketik) |
| `stderr is not defined`                                                 | `const { stderr } =` belum dipasang pada `execFileAsync`                                | Versi `renderScene` utuh (5.1)                                                                                                                                                      |
| Subtitle tidak tampil tanpa error                                       | Skala SRT 384x288                                                                       | File ASS (5.1)                                                                                                                                                                      |
| Subtitle: `Error opening memory font 'video-1.mp4'`                     | `fontsdir=.` memuat semua file di folder job                                            | Font di subfolder `fonts/`                                                                                                                                                          |

## 8. Hal yang dibahas tetapi tidak dipilih

- **Upload otomatis YouTube Data API v3** lewat node YouTube n8n. Catatan (dari pengetahuan umum, belum diverifikasi ulang): redirect URI OAuth tidak menerima IP LAN (perlu `localhost`/domain https), refresh token 7 hari saat consent screen berstatus Testing, project API yang belum diaudit bisa membuat video terkunci private, kuota default sekitar 10.000 unit/hari. Cek dokumentasi terbaru sebelum menerapkan.
- **Imagen (`:predict`) / Gemini image / Pollinations / Cloudflare Workers AI** untuk gambar: ditinggalkan demi footage.
- **Mode async untuk `finish`**: perlu jika server di-hosting di belakang Cloudflare Tunnel (batas ~100 detik, error 524). Di LAN belum perlu.

## 9. Keamanan

- **API key Pixabay pengguna pernah tertulis di chat** (juga tampil di tangkapan layar dokumentasi). Generate ulang di halaman API Pixabay dan simpan di credential **Query Auth** n8n (Name `key`), bukan di parameter node.
- Server render tidak punya autentikasi dan membuka `0.0.0.0:3000`. Aman di LAN; sebelum dibuka ke internet tambahkan API key sederhana (`x-api-key`) dan batasi firewall.
- Endpoint `finish` mengembalikan pesan error generik; detail ffmpeg hanya di log server.

## 10. Catatan platform

**Gemini API:** limit dihitung per **project** (bukan per key) dalam RPM, TPM, dan RPD; RPD reset tengah malam waktu Pasifik. Angka tier gratis tidak dipublikasikan di dokumentasi; lihat `ai.dev/rate-limit`. Satu run memakai ±1–2 ribu token (perkiraan). Retry On Fail dan seringnya Execute workflow saat debugging yang menghabiskan jatah.

**Kebijakan YouTube:** cek ketentuan pengungkapan konten sintetis/AI (suara TTS) dan kebijakan konten massal repetitif sebelum mengaktifkan monetisasi. Fakta dari Gemini bisa keliru: tonton dan cek tiap naskah sebelum publish.

**Gotcha n8n yang sering terjadi:**

- Field URL/body harus mode **Expression**; Import cURL meng-encode `{{ }}`.
- Nama parameter body harus **Fixed**.
- Tombol "Execute step" di node Code memakai data hulu yang tersimpan; jalankan ulang node hulu (dan unpin) bila skema berubah.
- `$('Nama Node')` harus cocok persis dengan nama node.
- `job_id` dibuat di node parse; menjalankan ulang node itu mengubah `job_id`.
- `$getWorkflowStaticData` hanya tersimpan pada eksekusi produksi (trigger di workflow yang dipublish), bukan Execute workflow manual.
- Binary: `TTS` → `data`; `Footage` → `video`; Attach Audio → `video` + `audio`; Finish → `video`.

## 11. Status dan TODO

**Sudah berjalan di mesin pengguna (dikonfirmasi lewat screenshot/log):** Trigger, Gemini, parse, TTS (6 mp3 berhasil dihasilkan setelah error 403 teratasi; penyebab pastinya tidak dikonfirmasi pengguna), Pixabay Primary (status 200), Pick Video, Footage, Attach Audio, Upload Scene (`ok: true`), Finish (menghasilkan mp4; satu video sudah diupload manual).

**Sudah diberikan, belum dikonfirmasi:**

1. Subtitle ASS (5.1): restart server dengan `FONT_FILE`/`FONT_NAME`, jalankan Upload Scene lalu Finish, putar hasilnya. Font: `C:/Windows/Fonts/arialbd.ttf` + `Arial`; alternatif `segoeuib.ttf` + `Segoe UI`. Jika teks tidak muncul, kirim baris log `[scene N] ffmpeg:` dan `FONT_FILE tidak ditemukan:`.
2. Node `Pilih Topik` + prompt Gemini baru (5.6) dan penyimpanan riwayat topik (5.3).
3. Node `Metadata` sebagai cabang dari Finish (5.7).
4. Kamus jargon baru (5.2): perlu didengarkan dan disetel.
5. Mount `/files` + env n8n di Docker, lalu node Write File to Disk.

**TODO berikutnya, urut prioritas:**

1. Buat `Pixabay Fallback` (relevansi footage; video pertama memakai footage kucing untuk topik makan siang).
2. Rotate key Pixabay dan pindahkan ke credential.
3. Pertimbangkan hybrid Pexels (filter portrait asli) atau tampilan blur-background untuk footage landscape.
4. Musik latar (FFmpeg `amix`), trigger jadwal (Cron/Webhook), dan mode async untuk `finish` jika di-hosting di luar LAN.
5. Tambah API key di server sebelum dibuka ke internet.
