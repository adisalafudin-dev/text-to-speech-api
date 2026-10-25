import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { config } from "../config/index.js";

export const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      fs.mkdirSync(req.jobDir, { recursive: true });
      cb(null, req.jobDir);
    },
    filename: (req, file, cb) => {
      const ext = path
        .extname(file.originalname)
        .toLowerCase()
        .replace(/[^.a-z0-9]/g, "");
      cb(null, `${file.fieldname}-${req.params.n}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) =>
    cb(null, file.fieldname === "audio" || file.fieldname === "video"),
  limits: { fileSize: config.maxUploadBytes, files: 2 },
}).fields([
  { name: "audio", maxCount: 1 },
  { name: "video", maxCount: 1 },
]);
