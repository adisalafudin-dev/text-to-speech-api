const DEFAULT_VOICE = "id-ID-ArdiNeural";
const MAX_TEXT_LENGTH = 5000;

export function validateTTSRequest(req, res, next) {
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
