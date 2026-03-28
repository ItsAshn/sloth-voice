// Server info + invite system (no relay needed)
const router = require("express").Router();
const {
  requireAuth,
  requireAdmin,
  requirePermission,
} = require("../middleware/auth");
const { getDb } = require("../db/database");
const crypto = require("crypto");

function getServerUrl() {
  if (process.env.SERVER_URL) return process.env.SERVER_URL;
  const host = process.env.PUBLIC_ADDRESS || "127.0.0.1";
  const port = process.env.SERVER_PORT || "5000";
  return `http://${host}:${port}`;
}

function encodeServerUrl(url) {
  return Buffer.from(url).toString("base64url");
}

function decodeServerUrl(encoded) {
  try {
    return Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

// GET /api/server/info — public info shown before joining
router.get("/info", (_req, res) => {
  const db = getDb();
  const nameSetting = db
    .prepare("SELECT value FROM server_settings WHERE key = 'name'")
    .get();
  return res.json({
    name: nameSetting?.value || process.env.SERVER_NAME || "Sloth Voice Server",
    description:
      process.env.SERVER_DESCRIPTION || "A locally-hosted Sloth Voice server",
    // Tell clients whether a password is required, without revealing it
    passwordProtected: !!(
      process.env.SERVER_PASSWORD && process.env.SERVER_PASSWORD.trim()
    ),
  });
});

// GET /api/server/resolve/:code — public, resolve invite code to server URL
// This allows clients to join by code alone without knowing the server URL
router.get("/resolve/:code", (req, res) => {
  const code = req.params.code.toUpperCase();
  const parts = code.split(".");
  if (parts.length !== 2) {
    return res.status(400).json({ error: "Invalid invite code format" });
  }
  const [encodedUrl, token] = parts;
  const serverUrl = decodeServerUrl(encodedUrl);
  if (!serverUrl) {
    return res.status(400).json({ error: "Invalid invite code format" });
  }
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const invite = db
    .prepare(
      `SELECT * FROM invite_codes
       WHERE code = ?
         AND (expires_at IS NULL OR expires_at > ?)
         AND (max_uses IS NULL OR uses < max_uses)`,
    )
    .get(token, now);
  if (!invite) {
    return res
      .status(404)
      .json({ error: "Invite code is invalid, expired, or exhausted" });
  }
  const nameSetting = db
    .prepare("SELECT value FROM server_settings WHERE key = 'name'")
    .get();
  return res.json({
    serverUrl,
    name: nameSetting?.value || process.env.SERVER_NAME || "Sloth Voice Server",
    description:
      process.env.SERVER_DESCRIPTION || "A locally-hosted Sloth Voice server",
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

// ─── Invite codes ────────────────────────────────────────────────────────────

/**
 * POST /api/server/invites   (admin only)
 * Body: { maxUses?: number, expiresInHours?: number }
 * Returns the full invite object including the code.
 */
router.post(
  "/invites",
  requireAuth,
  requirePermission("manage_invites"),
  (req, res) => {
    const { maxUses, expiresInHours } = req.body;
    const db = getDb();

    const token = crypto
      .randomBytes(6)
      .toString("base64url")
      .slice(0, 8)
      .toUpperCase();
    const serverUrl = getServerUrl();
    const encodedUrl = encodeServerUrl(serverUrl);
    const code = `${encodedUrl}.${token}`;
    const expiresAt =
      expiresInHours && expiresInHours > 0
        ? Math.floor(Date.now() / 1000) + Math.round(expiresInHours * 3600)
        : null;
    const max = maxUses && maxUses > 0 ? Math.round(maxUses) : null;

    db.prepare(
      "INSERT INTO invite_codes (code, created_by, max_uses, expires_at) VALUES (?, ?, ?, ?)",
    ).run(token, req.user.id, max, expiresAt);

    return res.status(201).json({ code, serverUrl, maxUses: max, expiresAt, uses: 0 });
  },
);

/**
 * GET /api/server/invites   (admin only)
 * Returns all non-expired, non-exhausted invite codes.
 */
router.get(
  "/invites",
  requireAuth,
  requirePermission("manage_invites"),
  (req, res) => {
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    const rows = db
      .prepare(
        `SELECT code, created_by, max_uses, uses, expires_at, created_at
       FROM invite_codes
       WHERE (expires_at IS NULL OR expires_at > ?)
         AND (max_uses IS NULL OR uses < max_uses)
       ORDER BY created_at DESC`,
      )
      .all(now);
    const serverUrl = getServerUrl();
    const encodedUrl = encodeServerUrl(serverUrl);
    const invites = rows.map((row) => ({
      ...row,
      code: `${encodedUrl}.${row.code}`,
    }));
    return res.json({ invites });
  },
);

/**
 * DELETE /api/server/invites/:code   (admin only)
 * Revokes an invite code immediately.
 */
router.delete(
  "/invites/:code",
  requireAuth,
  requirePermission("manage_invites"),
  (req, res) => {
    const db = getDb();
    const code = req.params.code.toUpperCase();
    const parts = code.split(".");
    const token = parts.length === 2 ? parts[1] : code;
    db.prepare("DELETE FROM invite_codes WHERE code = ?").run(token);
    return res.json({ ok: true });
  },
);

/**
 * POST /api/server/join/:code   (requires auth — existing account joins via invite)
 * If the user already has a server_members record this is a no-op.
 * Returns { ok: true, alreadyMember: bool }.
 */
router.post("/join/:code", requireAuth, (req, res) => {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const code = req.params.code.toUpperCase();
  const parts = code.split(".");
  const token = parts.length === 2 ? parts[1] : code;

  const invite = db
    .prepare(
      `SELECT * FROM invite_codes
       WHERE code = ?
         AND (expires_at IS NULL OR expires_at > ?)
         AND (max_uses IS NULL OR uses < max_uses)`,
    )
    .get(token, now);

  if (!invite) {
    return res
      .status(404)
      .json({ error: "Invite code is invalid, expired, or exhausted" });
  }

  const existing = db
    .prepare("SELECT 1 FROM server_members WHERE user_id = ?")
    .get(req.user.id);

  if (!existing) {
    db.prepare("INSERT INTO server_members (user_id, role) VALUES (?, ?)").run(
      req.user.id,
      "member",
    );
  }

  // Increment usage counter
  db.prepare("UPDATE invite_codes SET uses = uses + 1 WHERE code = ?").run(
    token,
  );

  return res.json({ ok: true, alreadyMember: !!existing });
});

// ─── Member management ───────────────────────────────────────────────────────

/**
 * PATCH /api/server/members/:userId/role   (admin only)
 * Body: { role: 'admin' | 'member' }
 * Promotes or demotes a user.
 */
router.patch("/members/:userId/role", requireAuth, requireAdmin, (req, res) => {
  const { role } = req.body;
  if (!["admin", "member"].includes(role)) {
    return res.status(400).json({ error: "role must be 'admin' or 'member'" });
  }
  const db = getDb();
  const target = db
    .prepare("SELECT 1 FROM server_members WHERE user_id = ?")
    .get(req.params.userId);
  if (!target) {
    return res.status(404).json({ error: "Member not found" });
  }
  db.prepare("UPDATE server_members SET role = ? WHERE user_id = ?").run(
    role,
    req.params.userId,
  );
  return res.json({ ok: true, userId: req.params.userId, role });
});

/**
 * DELETE /api/server/members/:userId   (admin only)
 * Kicks a user: removes their server_members row (they can still log in, just not be listed).
 * Admins cannot kick themselves.
 */
router.delete(
  "/members/:userId",
  requireAuth,
  requirePermission("kick_members"),
  (req, res) => {
    if (req.params.userId === req.user.id) {
      return res.status(400).json({ error: "You cannot kick yourself" });
    }
    const db = getDb();
    db.prepare("DELETE FROM server_members WHERE user_id = ?").run(
      req.params.userId,
    );
    return res.json({ ok: true });
  },
);

/**
 * PATCH /api/server/members/:userId/custom-role   (admin only)
 * Body: { roleId: string | null }  — null to unassign
 * Assigns or removes a custom role from a member.
 */
router.patch(
  "/members/:userId/custom-role",
  requireAuth,
  requireAdmin,
  (req, res) => {
    const { roleId } = req.body;
    const db = getDb();

    const target = db
      .prepare("SELECT 1 FROM server_members WHERE user_id = ?")
      .get(req.params.userId);
    if (!target) {
      return res.status(404).json({ error: "Member not found" });
    }

    if (roleId !== null && roleId !== undefined) {
      const role = db.prepare("SELECT 1 FROM roles WHERE id = ?").get(roleId);
      if (!role) {
        return res.status(404).json({ error: "Role not found" });
      }
    }

    db.prepare(
      "UPDATE server_members SET custom_role_id = ? WHERE user_id = ?",
    ).run(roleId ?? null, req.params.userId);

    return res.json({
      ok: true,
      userId: req.params.userId,
      roleId: roleId ?? null,
    });
  },
);

module.exports = router;
