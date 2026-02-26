const jwt = require("jsonwebtoken");
const { getDb } = require("../db/database");

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Default permissions for plain members (no custom role assigned).
 * These are the baseline rights any registered user has.
 */
const MEMBER_DEFAULTS = {
  send_messages: true,
  manage_channels: false,
  delete_messages: false,
  kick_members: false,
  manage_invites: false,
};

/**
 * Parse a permissions JSON blob stored in the DB.
 */
function parsePerms(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Resolve a user's effective permission value for a given key.
 * Admins always return true. Custom-role values override member defaults.
 */
function hasPermission(userInfo, perm) {
  if (!userInfo) return false;
  if (userInfo.role === "admin") return true;
  const perms = userInfo.permissions || {};
  return perm in perms ? !!perms[perm] : (MEMBER_DEFAULTS[perm] ?? false);
}

/**
 * Load a user's role + permissions from the DB without HTTP context.
 * Returns { role, permissions } or null if the user has no member record.
 * Use this in socket handlers where there is no req/res.
 */
function getUserPermissions(userId) {
  const db = getDb();
  const member = db
    .prepare(
      `SELECT sm.role, r.permissions
       FROM server_members sm
       LEFT JOIN roles r ON r.id = sm.custom_role_id
       WHERE sm.user_id = ?`,
    )
    .get(userId);
  if (!member) return null;
  return { role: member.role, permissions: parsePerms(member.permissions) };
}

/**
 * Middleware: requires a valid Bearer token.
 * Attaches req.user = { id, username, role, permissions } on success.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    const db = getDb();
    const member = db
      .prepare(
        `SELECT sm.role, r.permissions
         FROM server_members sm
         LEFT JOIN roles r ON r.id = sm.custom_role_id
         WHERE sm.user_id = ?`,
      )
      .get(payload.id);
    req.user = {
      id: payload.id,
      username: payload.username,
      role: member?.role || "member",
      permissions: parsePerms(member?.permissions),
    };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Middleware: requires the authenticated user to have the 'admin' role.
 * Must be used after requireAuth.
 */
function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin only" });
  }
  next();
}

/**
 * Middleware factory: checks that the authenticated user has a specific permission.
 * Admins always pass. Custom-role permissions override member defaults.
 * Must be used after requireAuth.
 *
 * Usage: router.post("/", requireAuth, requirePermission("send_messages"), handler)
 */
function requirePermission(perm) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (!hasPermission(req.user, perm)) {
      return res
        .status(403)
        .json({ error: "You do not have permission to do that" });
    }
    next();
  };
}

module.exports = {
  requireAuth,
  requireAdmin,
  requirePermission,
  getUserPermissions,
  hasPermission,
};
