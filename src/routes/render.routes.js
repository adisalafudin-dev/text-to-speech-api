import { Router } from "express";
import { upload } from "../middleware/upload.js";
import { finishJob, uploadScene } from "../controllers/render.controller.js";
import { validateJobParams } from "../middleware/validate-job.js";

const router = Router();

router.post("/:jobId/scenes/:n", validateJobParams, upload, uploadScene);
router.post("/:jobId/finish", validateJobParams, finishJob);

export default router;
