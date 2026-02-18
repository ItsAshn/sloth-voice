const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { getDb } = require("../db/database");
const { requireAuth } = require("../middleware/auth");

const JWT_SECRET = process.env.JWT_SECRET || "discard_server_secret_change_me";

// Helper
function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
    expiresIn: "30d",
  });
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const { username, password, displayName, serverPassword } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "username and password required" });

  // Enforce optional server password
  const required =
    process.env.SERVER_PASSWORD && process.env.SERVER_PASSWORD.trim();
  if (required && serverPassword !== required) {
    return res.status(403).json({ error: "Incorrect server password" });
  }

  const db = getDb();
  try {
    const hash = await bcrypt.hash(password, 12);
    const id = uuidv4();
    db.prepare(
      "INSERT INTO users (id, username, display_name, password_hash) VALUES (?, ?, ?, ?)",
    ).run(id, username.toLowerCase().trim(), displayName || username, hash);

    // First user on the server becomes admin; everyone else is a member
    const userCount = db
      .prepare("SELECT COUNT(*) as n FROM server_members")
      .get().n;
    const role = userCount === 0 ? "admin" : "member";
    db.prepare("INSERT INTO server_members (user_id, role) VALUES (?, ?)").run(
      id,
      role,
    );

    const user = db
      .prepare(
        "SELECT id, username, display_name, avatar, created_at FROM users WHERE id = ?",
      )
      .get(id);
    return res
      .status(201)
      .json({ token: signToken(user), user: { ...user, role } });
  } catch (err) {
    if (err.message?.includes("UNIQUE")) {
      return res
        .status(409)
        .json({ error: "Username already taken on this server" });
    }
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "username and password required" });

  const db = getDb();
  const user = db
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(username.toLowerCase().trim());

  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });

  // Ensure the user has a server_members record (handles legacy accounts)
  const member = db
    .prepare("SELECT role FROM server_members WHERE user_id = ?")
    .get(user.id);
  if (!member) {
    const anyAdmin = db
      .prepare("SELECT 1 FROM server_members WHERE role = 'admin'")
      .get();
    const role = anyAdmin ? "member" : "admin";
    db.prepare("INSERT INTO server_members (user_id, role) VALUES (?, ?)").run(
      user.id,
      role,
    );
  }

  const { role } = db
    .prepare("SELECT role FROM server_members WHERE user_id = ?")
    .get(user.id);

  return res.json({
    token: signToken(user),
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      avatar: user.avatar,
      role,
    },
  });
});

// GET /api/auth/me  (requires Authorization: Bearer <token>)
router.get("/me", (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer "))
    return res.status(401).json({ error: "Unauthorized" });
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    const db = getDb();
    const user = db
      .prepare(
        "SELECT id, username, display_name, avatar, created_at FROM users WHERE id = ?",
      )
      .get(payload.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    const member = db
      .prepare("SELECT role FROM server_members WHERE user_id = ?")
      .get(payload.id);
    return res.json({ user: { ...user, role: member?.role || "member" } });
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
});

// PATCH /api/auth/profile — update own display_name and/or avatar
router.patch("/profile", requireAuth, (req, res) => {
  const { display_name, avatar } = req.body;
  if (!display_name && avatar === undefined) {
    return res.status(400).json({ error: "Nothing to update" });
  }
  const db = getDb();
  const user = db
    .prepare(
      "SELECT id, username, display_name, avatar FROM users WHERE id = ?",
    )
    .get(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found" });

  const newName = display_name?.trim() || user.display_name;
  // avatar must be null, a data-URI string, or undefined (unchanged)
  const newAvatar = avatar === null ? null : avatar || user.avatar;

  db.prepare("UPDATE users SET display_name = ?, avatar = ? WHERE id = ?").run(
    newName,
    newAvatar,
    req.user.id,
  );

  const { role } = db
    .prepare("SELECT role FROM server_members WHERE user_id = ?")
    .get(req.user.id);

  return res.json({
    user: {
      id: user.id,
      username: user.username,
      display_name: newName,
      avatar: newAvatar,
      role,
    },
  });
});

// GET /api/auth/users  — list members (for contacts/friends within server)
router.get("/users", (req, res) => {
  const db = getDb();
  const users = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.avatar,
              COALESCE(m.role, 'member') as role
       FROM users u
       LEFT JOIN server_members m ON m.user_id = u.id
       ORDER BY u.username`,
    )
    .all();
  return res.json({ users });
});

module.exports = router;
module.exports.JWT_SECRET = JWT_SECRET;
