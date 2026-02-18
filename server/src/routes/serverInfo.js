// Server info + invite system (no relay needed)
const router = require("express").Router();
const { requireAuth } = require("../middleware/auth");

// GET /api/server/info — public info shown before joining
router.get("/info", (_req, res) => {
  return res.json({
    name: process.env.SERVER_NAME || "Discard Server",
    description:
      process.env.SERVER_DESCRIPTION || "A locally-hosted Discard server",
    // Tell clients whether a password is required, without revealing it
    passwordProtected: !!(
      process.env.SERVER_PASSWORD && process.env.SERVER_PASSWORD.trim()
    ),
  });
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
