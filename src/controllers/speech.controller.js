import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config/index.js";
import { synthesizeToFile } from "../services/tts.service.js";

export async function createSpeech(req, res) {
  const { text, voice } = req.ttsInput;

  const requestId = randomUUID();
  // Folder per request: msedge-tts selalu menulis ke "audio.mp3",
  // jadi tiap request butuh foldernya sendiri agar tidak saling menimpa.
  const requestDir = path.join(config.tmpDir, `tts-${requestId}`);

  const cleanup = () =>
    fs.rm(requestDir, { recursive: true, force: true }, (e) => {
      if (e) console.error(`[${requestId}] Cleanup gagal:`, e.message);
    });

  try {
    const audioFilePath = await synthesizeToFile(text, voice, requestDir);

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
}
