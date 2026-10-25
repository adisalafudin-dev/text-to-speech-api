import fs from "node:fs";
import path from "node:path";
import { loadScenes, removeDir, saveScene } from "../services/job.service.js";
import { renderJob } from "../services/render.service.js";
import { enqueue } from "../utils/render-queue.js";

// Upload audio + video footage untuk satu scene (multipart).
export function uploadScene(req, res) {
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
  saveScene(req.jobDir, {
    n,
    audio: audio.filename,
    video: video.filename,
    narration,
  });

  res.json({ ok: true, scene: n });
}

// Render semua scene yang sudah diupload, lalu kirim final.mp4.
export async function finishJob(req, res) {
  const { jobId } = req.params;
  const dir = req.jobDir;
  const burnSubtitles = req.body?.subtitles !== false;
  const cleanup = () => removeDir(dir);

  try {
    if (!fs.existsSync(dir)) {
      return res.status(404).json({ error: "Job tidak ditemukan." });
    }

    const scenes = loadScenes(dir);

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
}
