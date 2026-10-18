// Caption gaya Shorts/TikTok: kuning, tebal, berbayang, di TENGAH layar.
// Dibuat sebagai file ASS dengan kanvas sebesar video (default 1080x1920), sehingga
// ukuran font dan margin berarti piksel sebenarnya. (SRT/VTT yang dibakar langsung
// memakai kanvas default 384x288, itulah penyebab teks raksasa / hilang.)

export const DEFAULT_STYLE = {
  width: 1080,
  height: 1920,
  fontName: "Arial",
  fontSize: 78,
  // Warna ASS berformat &HAABBGGRR (urutan BGR!). Kuning = R255 G255 B0.
  primary: "&H00FFFFFF", // putih
  outlineColor: "&H00000000", // kontur hitam
  shadowColor: "&H99000000", // bayangan hitam ~60% pekat
  outline: 8,
  shadow: 7,
  alignment: 5, // 5 = tengah-tengah layar (2 = bawah, 8 = atas)
  marginV: 0,
  marginH: 70,
  wordsPerCue: 3,
  uppercase: true,
  pop: true, // animasi muncul: membesar sebentar + fade
};

const pad = (v, n = 2) => String(v).padStart(n, "0");

// Format waktu ASS: h:mm:ss.cc
export function toAssTime(sec) {
  const cs = Math.max(0, Math.round(sec * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor(cs / 6000) % 60;
  const s = Math.floor(cs / 100) % 60;
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs % 100)}`;
}

function header(o) {
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${o.width}
PlayResY: ${o.height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${o.fontName},${o.fontSize},${o.primary},${o.primary},${o.outlineColor},${o.shadowColor},1,0,0,0,100,100,0,0,1,${o.outline},${o.shadow},${o.alignment},${o.marginH},${o.marginH},${o.marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
}

// Buang karakter yang punya arti khusus di ASS dan tag HTML dari SRT/VTT.
function sanitize(text) {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/[{}\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function dialogue(start, end, text, o) {
  const body = o.uppercase ? text.toUpperCase() : text;
  // Pop: mulai 82% -> 100% dalam 0,12 dtk, dengan fade-in 0,05 dtk.
  const fx = o.pop
    ? "{\\fad(50,0)\\fscx82\\fscy82\\t(0,120,\\fscx100\\fscy100)}"
    : "";
  return `Dialogue: 0,${toAssTime(start)},${toAssTime(end)},Default,,0,0,0,,${fx}${body}`;
}

/** Dari narasi + durasi audio (dipakai server render). Waktu dibagi proporsional panjang karakter. */
export function buildAss(narration, duration, style = {}) {
  const o = { ...DEFAULT_STYLE, ...style };
  const words = sanitize(narration).split(" ").filter(Boolean);

  const chunks = [];
  for (let i = 0; i < words.length; i += o.wordsPerCue) {
    chunks.push(words.slice(i, i + o.wordsPerCue).join(" "));
  }
  const totalChars = chunks.reduce((sum, c) => sum + c.length, 0) || 1;

  let t = 0;
  const events = chunks.map((chunk) => {
    const start = t;
    t += (duration * chunk.length) / totalChars;
    return dialogue(start, t, chunk, o);
  });
  return header(o) + events.join("\n") + "\n";
}

// "00:01:02,500" | "01:02.500" | "1:02.5" -> detik
function parseTimestamp(s) {
  const m = s.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/);
  if (!m) return null;
  const [, h = "0", mi, se, ms] = m;
  return (
    Number(h) * 3600 +
    Number(mi) * 60 +
    Number(se) +
    Number(ms.padEnd(3, "0")) / 1000
  );
}

/** Parse isi file .srt atau .vtt menjadi [{start, end, text}]. */
export function parseSubtitles(content) {
  const text = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const cues = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split("\n").map((l) => l.trim());
    const idx = lines.findIndex((l) => l.includes("-->"));
    if (idx === -1) continue; // header WEBVTT, NOTE, STYLE, dsb.
    const [a, b] = lines[idx].split("-->");
    const start = parseTimestamp(a);
    const end = parseTimestamp((b ?? "").trim().split(/\s+/)[0] ?? ""); // abaikan cue settings VTT
    const body = sanitize(lines.slice(idx + 1).join(" "));
    if (start === null || end === null || end <= start || !body) continue;
    cues.push({ start, end, text: body });
  }
  return cues;
}

/**
 * Konversi isi .srt/.vtt ke ASS bergaya Shorts.
 * Teks panjang dipecah per `wordsPerCue` kata; waktunya dibagi dalam rentang cue aslinya.
 */
export function subtitleToAss(content, style = {}) {
  const o = { ...DEFAULT_STYLE, ...style };
  const events = [];
  for (const cue of parseSubtitles(content)) {
    const words = cue.text.split(" ");
    const chunks = [];
    for (let i = 0; i < words.length; i += o.wordsPerCue) {
      chunks.push(words.slice(i, i + o.wordsPerCue).join(" "));
    }
    const total = chunks.reduce((s, c) => s + c.length, 0) || 1;
    let t = cue.start;
    for (const chunk of chunks) {
      const start = t;
      t += ((cue.end - cue.start) * chunk.length) / total;
      events.push(dialogue(start, t, chunk, o));
    }
  }
  return header(o) + events.join("\n") + "\n";
}
