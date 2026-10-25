import { config } from "../config/index.js";

const { width: VIDEO_W, height: VIDEO_H } = config.video;

// Format waktu ASS: h:mm:ss.cc
export function toAssTime(sec) {
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
export function buildAss(narration, duration, wordsPerCue = 5) {
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
Style: Default,${config.font.name},64,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,4,0,2,60,60,380,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join("\n")}
`;
}
