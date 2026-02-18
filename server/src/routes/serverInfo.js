// Server info + invite system (no relay needed)
const router = require("express").Router();
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { getDb } = require("../db/database");

// GET /api/server/info — public info shown before joining
router.get("/info", (_req, res) => {
  const db = getDb();
  const nameSetting = db
    .prepare("SELECT value FROM server_settings WHERE key = 'name'")
    .get();
  return res.json({
    name: nameSetting?.value || process.env.SERVER_NAME || "Discard Server",
    description:
      process.env.SERVER_DESCRIPTION || "A locally-hosted Discard server",
    // Tell clients whether a password is required, without revealing it
    passwordProtected: !!(
      process.env.SERVER_PASSWORD && process.env.SERVER_PASSWORD.trim()
    ),
  });
});

// PATCH /api/server/settings — admin: update server name
router.patch("/settings", requireAuth, requireAdmin, (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  const db = getDb();
  db.prepare(
    "INSERT INTO server_settings (key, value) VALUES ('name', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(name.trim());
  return res.json({ name: name.trim() });
});

/**
 * POST /api/server/announce
 * Body: { title: string, body: string }
 * Requires auth. Broadcasts a server:announce event to all notification subscribers.
 */
router.post("/announce", requireAuth, (req, res) => {
  const { title, body } = req.body;
  if (!title || !body) {
    return res.status(400).json({ error: "title and body are required" });
  }

  const io = req.io;
  if (!io) return res.status(500).json({ error: "Socket.IO not available" });

  io.to("__notifications__").emit("server:announce", { title, body });
  return res.json({ ok: true });
});

module.exports = router;
