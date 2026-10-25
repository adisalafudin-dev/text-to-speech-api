import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../config/index.js";

const execFileAsync = promisify(execFile);

export function runFfmpeg(args, cwd) {
  return execFileAsync(config.ffmpeg, args, { cwd });
}

export async function getDuration(file, cwd) {
  const { stdout } = await execFileAsync(
    config.ffprobe,
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nw=1:nk=1",
      file,
    ],
    { cwd },
  );
  const d = parseFloat(stdout);
  if (!Number.isFinite(d) || d <= 0) {
    throw new Error(`Durasi audio tidak valid: ${file}`);
  }
  return d;
}
