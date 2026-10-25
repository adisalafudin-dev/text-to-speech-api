import multer from "multer";

export function errorHandler(err, _req, res, _next) {
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ error: "Payload JSON tidak valid." });
  }

  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload gagal: ${err.message}` });
  }

  console.error(err);

  if (!res.headersSent) {
    res.status(500).json({ error: "Internal server error." });
  }
}
