const router = require("express").Router();
const { v4: uuidv4 } = require("uuid");
const { getDb } = require("../db/database");
const {
  requireAuth,
  requireAdmin,
  requirePermission,
} = require("../middleware/auth");

// GET /api/channels
router.get("/", (_req, res) => {
  const db = getDb();
  const channels = db
    .prepare("SELECT * FROM channels ORDER BY position ASC")
    .all();
  return res.json({ channels });
});

// POST /api/channels — requires manage_channels permission
router.post(
  "/",
  requireAuth,
  requirePermission("manage_channels"),
  (req, res) => {
    const { name, type = "text", topic } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });

    const db = getDb();
    const id = uuidv4();
    const maxPos = db
      .prepare("SELECT COALESCE(MAX(position), -1) as m FROM channels")
      .get().m;
    db.prepare(
      "INSERT INTO channels (id, name, type, topic, position) VALUES (?, ?, ?, ?, ?)",
    ).run(
      id,
      name.trim().toLowerCase().replace(/\s+/g, "-"),
      type,
      topic || null,
      maxPos + 1,
    );

    const channel = db.prepare("SELECT * FROM channels WHERE id = ?").get(id);
    req.io.emit("channel:created", channel);
    return res.status(201).json({ channel });
  },
);

// PATCH /api/channels/:id — requires manage_channels permission
router.patch(
  "/:id",
  requireAuth,
  requirePermission("manage_channels"),
  (req, res) => {
    const { name, topic } = req.body;
    const db = getDb();
    const channel = db
      .prepare("SELECT * FROM channels WHERE id = ?")
      .get(req.params.id);
    if (!channel) return res.status(404).json({ error: "Not found" });

    db.prepare("UPDATE channels SET name = ?, topic = ? WHERE id = ?").run(
      name ?? channel.name,
      topic ?? channel.topic,
      req.params.id,
    );
    const updated = db
      .prepare("SELECT * FROM channels WHERE id = ?")
      .get(req.params.id);
    req.io.emit("channel:updated", updated);
    return res.json({ channel: updated });
  },
);

// DELETE /api/channels/:id — requires manage_channels permission
router.delete(
  "/:id",
  requireAuth,
  requirePermission("manage_channels"),
  (req, res) => {
    const db = getDb();
    db.prepare("DELETE FROM messages WHERE channel_id = ?").run(req.params.id);
    db.prepare("DELETE FROM channels WHERE id = ?").run(req.params.id);
    req.io.emit("channel:deleted", { id: req.params.id });
    return res.json({ ok: true });
  },
);

module.exports = router;
