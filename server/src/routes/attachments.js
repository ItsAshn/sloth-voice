const router = require("express").Router();
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const fs = require("fs");
const { getDb } = require("../db/database");
const { requireAuth } = require("../middleware/auth");

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, "../../uploads");
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || "10485760", 10); // 10MB default

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const ALLOWED_EXTENSIONS = [
  ".jpg", ".jpeg", ".png", ".gif", ".webp",
  ".mp4", ".webm", ".mp3", ".ogg", ".wav",
  ".pdf", ".txt", ".json",
];

const MIME_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".json": "application/json",
};

function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

// POST /api/attachments/:channelId — upload a file
router.post("/:channelId", requireAuth, (req, res) => {
  const { channelId } = req.params;
  const filename = req.headers["x-filename"];
  const contentLength = parseInt(req.headers["content-length"] || "0", 10);

  if (!filename) {
    return res.status(400).json({ error: "Missing x-filename header" });
  }

  const decodedFilename = decodeURIComponent(filename);
  const ext = path.extname(decodedFilename).toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return res.status(415).json({
      error: `File type not allowed. Allowed types: ${ALLOWED_EXTENSIONS.join(", ")}`,
    });
  }

  if (contentLength > MAX_FILE_SIZE) {
    return res.status(413).json({
      error: `File too large. Maximum size is ${Math.floor(MAX_FILE_SIZE / 1024 / 1024)}MB`,
    });
  }

  const id = uuidv4();
  const storedFilename = `${id}${ext}`;
  const filepath = path.join(UPLOADS_DIR, storedFilename);
  const now = Math.floor(Date.now() / 1000);

  const writeStream = fs.createWriteStream(filepath);
  req.pipe(writeStream);

  writeStream.on("error", (err) => {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Failed to upload file" });
  });

  writeStream.on("finish", () => {
    const stats = fs.statSync(filepath);
    const db = getDb();

    db.prepare(
      `INSERT INTO attachments (id, message_id, filename, url, size) VALUES (?, ?, ?, ?, ?)`
    ).run(id, null, decodedFilename, `/uploads/${storedFilename}`, stats.size);

    res.status(201).json({
      attachment: {
        id,
        filename: decodedFilename,
        url: `/uploads/${storedFilename}`,
        size: stats.size,
        content_type: getContentType(decodedFilename),
        created_at: now * 1000,
      },
    });
  });
});

// GET /api/attachments/message/:messageId — get attachments for a message
router.get("/message/:messageId", requireAuth, (req, res) => {
  const db = getDb();
  const attachments = db
    .prepare(`SELECT * FROM attachments WHERE message_id = ?`)
    .all(req.params.messageId);

  return res.json({
    attachments: attachments.map((a) => ({
      id: a.id,
      message_id: a.message_id,
      filename: a.filename,
      url: a.url,
      size: a.size,
      content_type: getContentType(a.filename),
      created_at: a.created_at * 1000,
    })),
  });
});

// GET /api/attachments/:filename — serve an uploaded file
router.get("/file/:filename", (req, res) => {
  const { filename } = req.params;
  const filepath = path.join(UPLOADS_DIR, filename);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: "File not found" });
  }

  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return res.status(403).json({ error: "File type not allowed" });
  }

  res.sendFile(filepath);
});

// DELETE /api/attachments/:id — delete an attachment (owner only)
router.delete("/:id", requireAuth, (req, res) => {
  const db = getDb();
  const attachment = db.prepare("SELECT * FROM attachments WHERE id = ?").get(req.params.id);

  if (!attachment) {
    return res.status(404).json({ error: "Attachment not found" });
  }

  if (!attachment.message_id) {
    const member = db.prepare("SELECT role FROM server_members WHERE user_id = ?").get(req.user.id);
    if (member?.role !== "admin") {
      return res.status(403).json({ error: "Can only delete attachments attached to messages" });
    }
  } else {
    const message = db.prepare("SELECT author_id FROM messages WHERE id = ?").get(attachment.message_id);
    if (message && message.author_id !== req.user.id) {
      return res.status(403).json({ error: "Not authorized" });
    }
  }

  const filepath = path.join(UPLOADS_DIR, path.basename(attachment.url));
  try {
    fs.unlinkSync(filepath);
  } catch {
    // File may not exist, ignore
  }

  db.prepare("DELETE FROM attachments WHERE id = ?").run(req.params.id);

  return res.json({ ok: true });
});

module.exports = router;