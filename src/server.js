import fs from "node:fs";
import app from "./app.js";
import { config } from "./config/index.js";
import { cleanupStale } from "./services/job.service.js";

// Pastikan direktori penyimpanan tersedia.
fs.mkdirSync(config.tmpDir, { recursive: true });

setInterval(cleanupStale, config.cleanupIntervalMs).unref();

app.listen(config.port, "0.0.0.0", () => {
  console.log(`TTS API berjalan di port ${config.port}`);
});
