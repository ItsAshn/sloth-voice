const router = require("express").Router();
const { v4: uuidv4 } = require("uuid");
const { getDb } = require("../db/database");
const { requireAuth } = require("../middleware/auth");

function getOrCreateDMChannel(db, userId, otherUserId) {
  const sortedIds = [userId, otherUserId].sort();
  let channel = db
    .prepare(
      `SELECT * FROM dm_channels WHERE user1_id = ? AND user2_id = ?`
    )
    .get(sortedIds[0], sortedIds[1]);

  if (!channel) {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO dm_channels (id, user1_id, user2_id) VALUES (?, ?, ?)`
    ).run(id, sortedIds[0], sortedIds[1]);
    channel = db.prepare(`SELECT * FROM dm_channels WHERE id = ?`).get(id);
  }

  return channel;
}

function formatDMChannel(channel, currentUserId) {
  const db = getDb();
  const otherUserId = channel.user1_id === currentUserId ? channel.user2_id : channel.user1_id;
  const otherUser = db
    .prepare(`SELECT id, username, display_name, avatar FROM users WHERE id = ?`)
    .get(otherUserId);

  return {
    id: channel.id,
    other_user_id: otherUserId,
    other_username: otherUser?.username || "Unknown",
    other_display_name: otherUser?.display_name || otherUser?.username || "Unknown",
    other_avatar: otherUser?.avatar || null,
    created_at: channel.created_at *1000,
    last_message_at: channel.last_message_at ? channel.last_message_at * 1000 : null,
  };
}

// GET /api/dms — list all DM channels for current user
router.get("/", requireAuth, (req, res) => {
  const db = getDb();
  const channels = db
    .prepare(
      `SELECT * FROM dm_channels WHERE user1_id = ? OR user2_id = ? ORDER BY last_message_at DESC`
    )
    .all(req.user.id, req.user.id);

  const formatted = channels.map((ch) => formatDMChannel(ch, req.user.id));
  return res.json({ channels: formatted });
});

// GET /api/dms/:userId — get or create DM channel with a user
router.get("/:userId", requireAuth, (req, res) => {
  const db = getDb();
  const otherUserId = req.params.userId;

  if (otherUserId === req.user.id) {
    return res.status(400).json({ error: "Cannot DM yourself" });
  }

  const otherUser = db
    .prepare(`SELECT id, username, display_name, avatar FROM users WHERE id = ?`)
    .get(otherUserId);

  if (!otherUser) {
    return res.status(404).json({ error: "User not found" });
  }

  const channel = getOrCreateDMChannel(db, req.user.id, otherUserId);
  return res.json({ channel: formatDMChannel(channel, req.user.id) });
});

// GET /api/dms/channel/:channelId/messages — get messages for a DM channel
router.get("/channel/:channelId/messages", requireAuth, (req, res) => {
  const db = getDb();
  const { channelId } = req.params;
  const limit = Math.min(parseInt(req.query.limit || "50", 10), 100);
  const before = req.query.before;

  const channel = db.prepare(`SELECT * FROM dm_channels WHERE id = ?`).get(channelId);
  if (!channel) {
    return res.status(404).json({ error: "Channel not found" });
  }

  if (channel.user1_id !== req.user.id && channel.user2_id !== req.user.id) {
    return res.status(403).json({ error: "Not authorized" });
  }

  let rows;
  if (before) {
    const anchor = db
      .prepare("SELECT created_at FROM direct_messages WHERE id = ?")
      .get(before);
    rows = anchor
      ? db
          .prepare(
            `SELECT dm.*, u.display_name FROM direct_messages dm
             LEFT JOIN users u ON dm.from_id = u.id
             WHERE dm.channel_id = ? AND dm.created_at < ?
             ORDER BY dm.created_at DESC LIMIT ?`,
          )
          .all(channelId, anchor.created_at, limit)
          .reverse()
      : [];
  } else {
    rows = db
      .prepare(
        `SELECT dm.*, u.display_name FROM direct_messages dm
         LEFT JOIN users u ON dm.from_id = u.id
         WHERE dm.channel_id = ?
         ORDER BY dm.created_at DESC LIMIT ?`,
      )
      .all(channelId, limit)
      .reverse();
  }

  const messages = rows.map((row) => ({
    id: row.id,
    channel_id: channelId,
    from_id: row.from_id,
    from_username: row.from_username,
    display_name: row.display_name || row.from_username,
    content: row.content,
    created_at: row.created_at *1000,
  }));

  return res.json({ messages });
});

// POST /api/dms/channel/:channelId/messages — send a DM
router.post("/channel/:channelId/messages", requireAuth, (req, res) => {
  const db = getDb();
  const { channelId } = req.params;
  const { content } = req.body;

  if (!content?.trim()) {
    return res.status(400).json({ error: "content required" });
  }
  if (content.length > 4000) {
    return res.status(400).json({ error: "Message too long (max4000 characters)" });
  }

  const channel = db.prepare(`SELECT * FROM dm_channels WHERE id = ?`).get(channelId);
  if (!channel) {
    return res.status(404).json({ error: "Channel not found" });
  }

  if (channel.user1_id !== req.user.id && channel.user2_id !== req.user.id) {
    return res.status(403).json({ error: "Not authorized" });
  }

  const otherUserId = channel.user1_id === req.user.id ? channel.user2_id : channel.user1_id;
  const otherUser = db
    .prepare(`SELECT id FROM server_members WHERE user_id = ?`)
    .get(otherUserId);

  if (!otherUser) {
    return res.status(400).json({ error: "Recipient is not a server member" });
  }

  const userRow = db
    .prepare(`SELECT id, username, display_name FROM users WHERE id = ?`)
    .get(req.user.id);

  const id = uuidv4();
  const now = Math.floor(Date.now() / 1000);

  db.prepare(
    `INSERT INTO direct_messages (id, channel_id, from_id, from_username, to_id, content, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, channelId, req.user.id, userRow.username, otherUserId, content.trim(), now);

  db.prepare(
    `UPDATE dm_channels SET last_message_at = ? WHERE id = ?`
  ).run(now, channelId);

  const message = {
    id,
    channel_id: channelId,
    from_id: req.user.id,
    from_username: userRow.username,
    display_name: userRow.display_name || userRow.username,
    content: content.trim(),
    created_at: now *1000,
  };

  req.io.to(`dm:${otherUserId}`).emit("dm:received", message);
  req.io.to(`dm:${req.user.id}`).emit("dm:sent", message);

  return res.status(201).json({ message });
});

module.exports = router;