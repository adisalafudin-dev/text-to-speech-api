import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../..");

export const config = {
  port: Number(process.env.PORT) || 3000,
  tmpDir: path.join(ROOT_DIR, "tmp"),

  // Path executable bisa dioverride lewat env jika PATH terminal tidak terbaca.
  ffmpeg: process.env.FFMPEG_PATH || "ffmpeg",
  ffprobe: process.env.FFPROBE_PATH || "ffprobe",

  // Font subtitle: file disalin ke folder job, nama keluarga harus cocok.
  font: {
    file: process.env.FONT_FILE || "C:/Windows/Fonts/arialbd.ttf",
    name: process.env.FONT_NAME || "Arial",
  },

  video: { width: 1080, height: 1920, fps: 30 },

  maxScenes: 20,
  jobIdRegex: /^[A-Za-z0-9_-]{6,64}$/,
  maxUploadBytes: 200 * 1024 * 1024,

  staleAfterMs: 60 * 60 * 1000,
  cleanupIntervalMs: 10 * 60 * 1000,
};
