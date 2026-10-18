import express from "express";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { validateTTSRequest } from "./src/controllers/tts.controller.js";
import multer from "multer";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
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

// ---------- antrean TTS: berurutan, ada jeda, retry saat 429 ----------
const TTS_MIN_GAP_MS = Number(process.env.TTS_MIN_GAP_MS) || 1500;
const TTS_BACKOFF_MS = Number(process.env.TTS_BACKOFF_MS) || 3000;
const TTS_MAX_RETRIES = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let ttsQueue = Promise.resolve();
let lastTtsAt = 0;

function enqueueTts(task) {
  const run = ttsQueue.then(async () => {
    const wait = lastTtsAt + TTS_MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await task();
    } finally {
      lastTtsAt = Date.now();
    }
  });
  ttsQueue = run.catch(() => {});
  return run;
}

async function synthesize(requestId, requestDir, voice, text) {
  for (let attempt = 0; ; attempt++) {
    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(
        voice,
        OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
      );
      return await tts.toFile(requestDir, text);
    } catch (error) {
      const rateLimited = /\b429\b/.test(error.message);
      if (!rateLimited || attempt >= TTS_MAX_RETRIES) throw error;

      const delay = TTS_BACKOFF_MS * 2 ** attempt; // 3s, 6s, 12s
      console.warn(
        `[${requestId}] Edge TTS 429, coba lagi dalam ${delay} ms (percobaan ${attempt + 1}/${TTS_MAX_RETRIES})`,
      );
      await sleep(delay);
    }
  }
}

app.post("/api/tts", validateTTSRequest, async (req, res) => {
  const { text, voice } = req.ttsInput;

  const requestId = randomUUID();
  const requestDir = path.join(TMP_DIR, `tts-${requestId}`);

  const cleanup = () =>
    fs.rm(requestDir, { recursive: true, force: true }, (e) => {
      if (e) console.error(`[${requestId}] Cleanup gagal:`, e.message);
    });

  try {
    fs.mkdirSync(requestDir, { recursive: true });

    const processedText = preprocessText(text);

    const { audioFilePath } = await enqueueTts(() =>
      synthesize(requestId, requestDir, voice, processedText),
    );

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
// 4. HEALTH CHECK
// ==================================================

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "custom-tts-api",
  });
});

// ==================================================
// RENDER VIDEO (YouTube Shorts 9:16)
// ==================================================

const VIDEO_W = 1080;
const VIDEO_H = 1920;
const FPS = 30;
const MAX_SCENES = 20;
// Zoom pelan pada gambar. Berat untuk STB, jadi default mati.

const JOB_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

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

function toSrtTime(sec) {
  const total = Math.round(sec * 1000);
  const ms = total % 1000;
  const s = Math.floor(total / 1000) % 60;
  const m = Math.floor(total / 60000) % 60;
  const h = Math.floor(total / 3600000);
  const p = (v, l = 2) => String(v).padStart(l, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`;
}

// Pecah narasi jadi potongan pendek; waktu dibagi sesuai panjang karakter.
function toAssTime(sec) {
  const cs = Math.round(sec * 100);
  const h = Math.floor(cs / 360000);
  const m = Math.floor(cs / 6000) % 60;
  const s = Math.floor(cs / 100) % 60;
  const c = cs % 100;
  const p = (v) => String(v).padStart(2, "0");
  return `${h}:${p(m)}:${p(s)}.${p(c)}`;
}

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

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";
const FONT_FILE = process.env.FONT_FILE || "C:/Windows/Fonts/arialbd.ttf";
const FONT_NAME = process.env.FONT_NAME || "Arial";

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

// ---------- endpoint ----------

// Upload audio + gambar untuk satu scene (multipart).
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
    cleanup();
    if (!res.headersSent) {
      res.status(500).json({ error: "Gagal merender video." });
    }
  }
});

// Bersihkan job yang ditinggalkan (lebih dari 1 jam).
setInterval(
  () => {
    for (const name of fs.readdirSync(TMP_DIR)) {
      if (!name.startsWith("job-")) continue;
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

// Tangani JSON yang tidak valid.
app.use((err, _req, res, _next) => {
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({
      error: "Payload JSON tidak valid.",
    });
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
