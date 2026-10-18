// Membungkus naskah dengan fragmen SSML untuk msedge-tts.
// msedge-tts sudah membungkus input dengan <speak><voice><prosody>, jadi di sini
// kita hanya membuat ISI-nya: <prosody> bersarang untuk hook dan <break> untuk jeda.

const HOOK_RATE = process.env.TTS_HOOK_RATE || "+10%";
const HOOK_PITCH = process.env.TTS_HOOK_PITCH || ""; // contoh "+2Hz"; kosong = tidak diubah
const BREAK_MS = Number(process.env.TTS_BREAK_MS) || 500;

// Kalimat yang diawali kata-kata ini dianggap awal "poin penting".
const IMPORTANT_STARTERS = [
  "faktanya",
  "ternyata",
  "tapi",
  "namun",
  "padahal",
  "bayangkan",
  "rahasianya",
  "alasannya",
  "intinya",
  "yang menarik",
  "yang mengejutkan",
  "lebih mengejutkan",
  "lebih gila lagi",
  "pertama",
  "kedua",
  "ketiga",
  "terakhir",
  "jadi",
];

// Penanda manual di naskah: "[jeda]" atau "||" memaksa jeda di titik itu.
const MANUAL_BREAK_RE = /\s*(?:\[jeda\]|\|\|)\s*/gi;
const MANUAL_BREAK_TOKEN = "\u0000BREAK\u0000";

export function escapeXml(text) {
  // Di isi elemen cukup tiga karakter ini; &quot; / &apos; sengaja tidak dipakai.
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function splitSentences(text) {
  return text
    .split(/(?<=[.!?…])\s+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

function startsWithImportant(sentence) {
  const lower = sentence.toLowerCase();
  return IMPORTANT_STARTERS.some(
    (word) =>
      lower === word ||
      lower.startsWith(`${word} `) ||
      lower.startsWith(`${word},`),
  );
}

const breakTag = (ms) => `<break time="${ms}ms"/>`;

export function buildSsml(text, opts = {}) {
  const hookRate = opts.hookRate ?? HOOK_RATE;
  const hookPitch = opts.hookPitch ?? HOOK_PITCH;
  const breakMs = opts.breakMs ?? BREAK_MS;

  const useBreaks = opts.breaks ?? true;

  const marked = text.replace(MANUAL_BREAK_RE, ` ${MANUAL_BREAK_TOKEN} `);
  const sentences = splitSentences(marked);

  const parts = [];
  let forceBreak = false;

  sentences.forEach((raw, index) => {
    const pieces = raw.split(MANUAL_BREAK_TOKEN);
    pieces.forEach((piece, pieceIndex) => {
      if (pieceIndex > 0) forceBreak = true;
      const sentence = piece.trim();
      if (!sentence) return;

      const isHook = index === 0 && pieceIndex === 0;
      const body = escapeXml(sentence);

      if (isHook) {
        const pitchAttr = hookPitch ? ` pitch="${hookPitch}"` : "";
        parts.push(`<prosody rate="${hookRate}"${pitchAttr}>${body}</prosody>`);
        forceBreak = true; // jeda singkat setelah hook
        return;
      }

      if (forceBreak || startsWithImportant(sentence)) {
        if (useBreaks) parts.push(breakTag(breakMs));
        forceBreak = false;
      }
      parts.push(body);
    });
  });

  return parts.join(" ");
}

export function buildPayloads(text, opts = {}) {
  const levels = [
    { level: "full", body: buildSsml(text, { ...opts, breaks: true }) },
    { level: "hook-only", body: buildSsml(text, { ...opts, breaks: false }) },
    { level: "plain", body: escapeXml(text) },
  ];
  // Buang tingkat yang hasilnya sama persis dengan sebelumnya.
  return levels.filter((l, i) => i === 0 || l.body !== levels[i - 1].body);
}
