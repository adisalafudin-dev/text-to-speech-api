import fs from "node:fs";
import path from "node:path";
import { config } from "../config/index.js";
import { getDuration, runFfmpeg } from "./ffmpeg.service.js";
import { buildAss } from "./subtitle.service.js";

const { width: VIDEO_W, height: VIDEO_H, fps: FPS } = config.video;

async function renderScene(dir, scene, burnSubtitles) {
  const duration = await getDuration(scene.audio, dir);
  const out = `clip-${scene.n}.mp4`;

  const filters = [
    `fps=${FPS}`,
    `scale=${VIDEO_W}:${VIDEO_H}:force_original_aspect_ratio=increase`,
    `crop=${VIDEO_W}:${VIDEO_H}`,
    "setsar=1",
  ];

  const withSubtitles = burnSubtitles && scene.narration;
  console.log(
    `[scene ${scene.n}] subtitle: ${withSubtitles ? "ON" : "OFF"}, panjang narasi: ${scene.narration?.length ?? 0}`,
  );

  if (withSubtitles) {
    const assName = `scene-${scene.n}.ass`;
    fs.writeFileSync(
      path.join(dir, assName),
      buildAss(scene.narration, duration),
    );

    // Font di subfolder khusus, supaya libass tidak mencoba memuat mp4/mp3.
    const fontDir = path.join(dir, "fonts");
    fs.mkdirSync(fontDir, { recursive: true });
    if (fs.existsSync(config.font.file)) {
      fs.copyFileSync(
        config.font.file,
        path.join(fontDir, "subtitle-font.ttf"),
      );
    } else {
      console.warn(`FONT_FILE tidak ditemukan: ${config.font.file}`);
    }

    filters.push(`ass=${assName}:fontsdir=fonts`);
  }

  const { stderr } = await runFfmpeg(
    [
      "-hide_banner",
      "-loglevel",
      "warning",
      "-nostats",
      "-y",
      "-stream_loop",
      "-1",
      "-i",
      scene.video, // loop jika footage lebih pendek dari suara
      "-i",
      scene.audio,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0", // suara asli footage dibuang
      "-vf",
      filters.join(","),
      "-t",
      duration.toFixed(3),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-r",
      String(FPS),
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      out,
    ],
    dir,
  );

  if (stderr) console.warn(`[scene ${scene.n}] ffmpeg:`, stderr.slice(0, 500));

  return out;
}

export async function renderJob(dir, scenes, burnSubtitles) {
  const clips = [];
  for (const scene of scenes) {
    clips.push(await renderScene(dir, scene, burnSubtitles));
  }

  fs.writeFileSync(
    path.join(dir, "list.txt"),
    clips.map((c) => `file '${c}'`).join("\n"),
  );

  await runFfmpeg(
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostats",
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      "list.txt",
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      "final.mp4",
    ],
    dir,
  );

  return path.join(dir, "final.mp4");
}
