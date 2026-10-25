import fs from "node:fs";
import path from "node:path";
import { config } from "../config/index.js";

export const jobDirOf = (jobId) => path.join(config.tmpDir, `job-${jobId}`);

export function saveScene(dir, scene) {
  fs.writeFileSync(
    path.join(dir, `scene-${scene.n}.json`),
    JSON.stringify(scene),
  );
}

export function loadScenes(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => /^scene-\d+\.json$/.test(f))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")))
    .sort((a, b) => a.n - b.n);
}

export function removeDir(dir, onError) {
  fs.rm(dir, { recursive: true, force: true }, (e) => {
    if (e && onError) onError(e);
  });
}

// Bersihkan folder job/tts yang ditinggalkan (lebih dari batas waktu).
export function cleanupStale() {
  for (const name of fs.readdirSync(config.tmpDir)) {
    if (!/^(job|tts)-/.test(name)) continue;
    const p = path.join(config.tmpDir, name);
    try {
      if (Date.now() - fs.statSync(p).mtimeMs > config.staleAfterMs) {
        fs.rmSync(p, { recursive: true, force: true });
      }
    } catch {}
  }
}
