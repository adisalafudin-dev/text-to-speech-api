import { config } from "../config/index.js";
import { jobDirOf } from "../services/job.service.js";

export function validateJobParams(req, res, next) {
  const { jobId, n } = req.params;

  if (!config.jobIdRegex.test(jobId)) {
    return res.status(400).json({ error: "jobId tidak valid." });
  }

  if (n !== undefined) {
    const num = Number(n);
    if (!Number.isInteger(num) || num < 1 || num > config.maxScenes) {
      return res.status(400).json({ error: "Nomor scene tidak valid." });
    }
  }

  req.jobDir = jobDirOf(jobId);
  next();
}
