import express from "express";
import healthRoutes from "./routes/health.routes.js";
import ttsRoutes from "./routes/tts.routes.js";
import renderRoutes from "./routes/render.routes.js";
import { errorHandler } from "./middleware/error-handler.js";

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));

app.use("/health", healthRoutes);
app.use("/api/tts", ttsRoutes);
app.use("/api/render", renderRoutes);

app.use(errorHandler);

export default app;
