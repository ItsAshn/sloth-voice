const router = require("express").Router();
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const { getDb } = require("../db/database");
const { parseMentions, processMentions } = require("../socket/chatHandler");

const JWT_SECRET = process.env.JWT_SECRET || "discard_server_secret_change_me";

function authenticate(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// Map DB row to client-friendly format
function mapMessage(row) {
  return {
    id: row.id,
    channel_id: row.channel_id,
    user_id: row.author_id,
    username: row.author_username,
    display_name: row.display_name || row.author_username,
    content: row.content,
    created_at: row.created_at * 1000, // seconds → milliseconds
    edited_at: row.edited_at ? row.edited_at * 1000 : null,
  };
}

// GET /api/messages/:channelId?limit=50&before=messageId
router.get("/:channelId", (req, res) => {
  const { channelId } = req.params;
  const limit = Math.min(parseInt(req.query.limit || "50", 10), 100);
  const before = req.query.before;
  const db = getDb();

  const SELECT = `
    SELECT m.*, u.display_name
    FROM messages m
    LEFT JOIN users u ON m.author_id = u.id
    WHERE m.channel_id = ?`;

  let rows;
  if (before) {
    const anchor = db
      .prepare("SELECT created_at FROM messages WHERE id = ?")
      .get(before);
    rows = anchor
      ? db
          .prepare(
            `${SELECT} AND m.created_at < ? ORDER BY m.created_at DESC LIMIT ?`,
          )
          .all(channelId, anchor.created_at, limit)
          .reverse()
      : [];
  } else {
    rows = db
      .prepare(`${SELECT} ORDER BY m.created_at DESC LIMIT ?`)
      .all(channelId, limit)
      .reverse();
  }

  return res.json({ messages: rows.map(mapMessage) });
});

// POST /api/messages/:channelId
router.post("/:channelId", authenticate, (req, res) => {
  const { content } = req.body;
  if (!content?.trim())
    return res.status(400).json({ error: "content required" });

  const db = getDb();
  // Fetch display_name from users table
  const userRow = db
    .prepare("SELECT id, username, display_name FROM users WHERE id = ?")
    .get(req.user.id);
  if (!userRow) return res.status(401).json({ error: "User not found" });

  const id = uuidv4();
  db.prepare(
    `INSERT INTO messages (id, channel_id, author_id, author_username, content)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, req.params.channelId, userRow.id, userRow.username, content.trim());

  const message = db.prepare("SELECT * FROM messages WHERE id = ?").get(id);
  const out = mapMessage({ ...message, display_name: userRow.display_name });
  req.io.to(req.params.channelId).emit("message:new", out);
  req.io.to("__notifications__").emit("message:new", out);

  // Process @mentions
  const mentions = parseMentions(content.trim());
  processMentions(req.io, message, mentions);

  return res.status(201).json({ message: out });
});

// PATCH /api/messages/:id
router.patch("/:id", authenticate, (req, res) => {
  const { content } = req.body;
  const db = getDb();
  const msg = db
    .prepare("SELECT * FROM messages WHERE id = ?")
    .get(req.params.id);
  if (!msg) return res.status(404).json({ error: "Not found" });
  if (msg.author_id !== req.user.id)
    return res.status(403).json({ error: "Forbidden" });

  db.prepare(
    "UPDATE messages SET content = ?, edited_at = unixepoch() WHERE id = ?",
  ).run(content, req.params.id);
  const updated = db
    .prepare("SELECT * FROM messages WHERE id = ?")
    .get(req.params.id);
  req.io.to(msg.channel_id).emit("message:updated", updated);
  return res.json({ message: updated });
});

// DELETE /api/messages/:id
router.delete("/:id", authenticate, (req, res) => {
  const db = getDb();
  const msg = db
    .prepare("SELECT * FROM messages WHERE id = ?")
    .get(req.params.id);
  if (!msg) return res.status(404).json({ error: "Not found" });
  if (msg.author_id !== req.user.id)
    return res.status(403).json({ error: "Forbidden" });

  db.prepare("DELETE FROM messages WHERE id = ?").run(req.params.id);
  req.io
    .to(msg.channel_id)
    .emit("message:deleted", { id: req.params.id, channelId: msg.channel_id });
  return res.json({ ok: true });
});

module.exports = router;
