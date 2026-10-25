import { Router } from "express";
import { validateTTSRequest } from "../controllers/tts.controller.js";
import { createSpeech } from "../controllers/speech.controller.js";

const router = Router();

router.post("/", validateTTSRequest, createSpeech);

export default router;
