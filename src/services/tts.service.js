import fs from "node:fs";
import path from "node:path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { preprocessText } from "../utils/preprocess.js";

// Menulis mp3 ke requestDir dan mengembalikan path file-nya.
export async function synthesizeToFile(text, voice, requestDir) {
  fs.mkdirSync(requestDir, { recursive: true });

  const processedText = preprocessText(text);

  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const { audioFilePath } = await tts.toFile(requestDir, processedText);

  if (!audioFilePath || !fs.existsSync(audioFilePath)) {
    throw new Error("File audio tidak berhasil dibuat.");
  }

  if (path.dirname(path.resolve(audioFilePath)) !== path.resolve(requestDir)) {
    throw new Error("Lokasi file audio tidak valid.");
  }

  return audioFilePath;
}
