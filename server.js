import express from "express";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TMP_DIR = path.join(__dirname, "tmp");
const DEFAULT_VOICE = "id-ID-ArdiNeural";
const MAX_TEXT_LENGTH = 5000;

// Pastikan direktori penyimpanan tersedia.
fs.mkdirSync(TMP_DIR, { recursive: true });

app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));

// ==================================================
// 1. JARGON PREPROCESSOR
// ==================================================

const JARGON_DICTIONARY = {
  ESP32: "i es pi tiga dua",
  Termux: "termuks",
  backend: "bek-end",
  "Node.js": "not ji-es",
};

function preprocessText(text) {
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

// ==================================================
// 2. MIDDLEWARE VALIDASI
// ==================================================

function validateTTSRequest(req, res, next) {
  const { text, voice = DEFAULT_VOICE } = req.body ?? {};

  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({
      error: "Field 'text' wajib berupa string yang tidak kosong.",
    });
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return res.status(413).json({
      error: `Panjang teks maksimal ${MAX_TEXT_LENGTH} karakter.`,
    });
  }

  if (
    typeof voice !== "string" ||
    !/^[a-z]{2}-[A-Za-z]{2}-[A-Za-z0-9]+$/.test(voice)
  ) {
    return res.status(400).json({
      error: "Format voice tidak valid.",
    });
  }

  req.ttsInput = {
    text: text.trim(),
    voice,
  };

  next();
}

// ==================================================
// 3. ENDPOINT TTS
// ==================================================

app.post("/api/tts", validateTTSRequest, async (req, res) => {
  const { text, voice } = req.ttsInput;
  console.log("Request Teks", text);

  const requestId = randomUUID();
  const requestDir = path.join(TMP_DIR);

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

    res.download(audioFilePath, `speech-${text}-${requestId}.mp3`, (err) => {
      console.log(`[${requestId}] audioFilePath:`, audioFilePath);

      if (err) {
        console.error(`[${requestId}] Pengiriman gagal:`, err.message);
        if (!res.headersSent && !res.destroyed) {
          res.status(500).json({ error: "Gagal mengirim file audio." });
        }
      }
    });
    // cleanup();
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
// Tangani JSON yang tidak valid.
app.use((err, _req, res, _next) => {
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({
      error: "Payload JSON tidak valid.",
    });
  }

  console.error(err);

  if (!res.headersSent) {
    res.status(500).json({ error: "Internal server error." });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`TTS API berjalan di port ${PORT}`);
});
