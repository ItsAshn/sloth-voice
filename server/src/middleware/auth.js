const jwt = require("jsonwebtoken");
const { getDb } = require("../db/database");

const JWT_SECRET = process.env.JWT_SECRET || "discard_server_secret_change_me";

/**
 * Middleware: requires a valid Bearer token.
 * Attaches req.user = { id, username, role } on success.
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
      .prepare("SELECT role FROM server_members WHERE user_id = ?")
      .get(payload.id);
    req.user = {
      id: payload.id,
      username: payload.username,
      role: member?.role || "member",
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

module.exports = { requireAuth, requireAdmin };
