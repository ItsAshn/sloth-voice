const router = require("express").Router();
const { v4: uuidv4 } = require("uuid");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { getDb } = require("../db/database");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parsePerms(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

function fmtRole(row) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    permissions: parsePerms(row.permissions),
    created_at: row.created_at,
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/roles  — list all roles (any authenticated user)
router.get("/", requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM roles ORDER BY created_at ASC").all();
  return res.json({ roles: rows.map(fmtRole) });
});

// POST /api/roles  — create a new role (admin only)
// Body: { name: string, color?: string, permissions?: Record<string, boolean> }
router.post("/", requireAuth, requireAdmin, (req, res) => {
  const { name, color = "#5865f2", permissions = {} } = req.body;
  if (!name?.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  const db = getDb();
  const id = uuidv4();
  db.prepare(
    "INSERT INTO roles (id, name, color, permissions) VALUES (?, ?, ?, ?)",
  ).run(id, name.trim(), color, JSON.stringify(permissions));

  const row = db.prepare("SELECT * FROM roles WHERE id = ?").get(id);
  return res.status(201).json({ role: fmtRole(row) });
});

// PATCH /api/roles/:id  — update an existing role (admin only)
// Body: { name?: string, color?: string, permissions?: Record<string, boolean> }
router.patch("/:id", requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM roles WHERE id = ?")
    .get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: "Role not found" });
  }

  const name = req.body.name?.trim() || existing.name;
  const color = req.body.color || existing.color;
  const permissions =
    req.body.permissions !== undefined
      ? JSON.stringify(req.body.permissions)
      : existing.permissions;

  db.prepare(
    "UPDATE roles SET name = ?, color = ?, permissions = ? WHERE id = ?",
  ).run(name, color, permissions, req.params.id);

  const updated = db
    .prepare("SELECT * FROM roles WHERE id = ?")
    .get(req.params.id);
  return res.json({ role: fmtRole(updated) });
});

// DELETE /api/roles/:id  — delete a role (admin only)
// Unassigns the role from all members first.
router.delete("/:id", requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const existing = db
    .prepare("SELECT 1 FROM roles WHERE id = ?")
    .get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: "Role not found" });
  }
  // Unassign from members
  db.prepare(
    "UPDATE server_members SET custom_role_id = NULL WHERE custom_role_id = ?",
  ).run(req.params.id);
  db.prepare("DELETE FROM roles WHERE id = ?").run(req.params.id);
  return res.json({ ok: true });
});

module.exports = router;
