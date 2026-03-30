const { v4: uuidv4 } = require("uuid");
const { getDb } = require("../db/database");
const { getUserPermissions, hasPermission } = require("../middleware/auth");

// Room name for sockets that want server-wide push notifications
const NOTIFICATION_ROOM = "__notifications__";

/**
 * Parse @mentions from message content.
 * Returns an array of { type, target } where:
 *   type = 'everyone' | 'here' | 'user'
 *   target = username string (for 'user') or null
 */
function parseMentions(content) {
  const results = [];
  const seen = new Set();

  // @everyone / @here
  if (/@everyone\b/.test(content) && !seen.has("everyone")) {
    results.push({ type: "everyone", target: null });
    seen.add("everyone");
  }
  if (/@here\b/.test(content) && !seen.has("here")) {
    results.push({ type: "here", target: null });
    seen.add("here");
  }

  // @username  (letters, digits, underscores, hyphens, dots)
  const userPattern = /@([\w.\-]+)/g;
  let match;
  while ((match = userPattern.exec(content)) !== null) {
    const username = match[1].toLowerCase();
    if (username === "everyone" || username === "here") continue;
    if (!seen.has(username)) {
      results.push({ type: "user", target: username });
      seen.add(username);
    }
  }

  return results;
}

/**
 * Resolve mentions to user rows, persist them, and emit per-user socket events.
 */
function processMentions(io, message, mentions) {
  if (!mentions.length) return;
  const db = getDb();

  for (const mention of mentions) {
    const mentionId = uuidv4();
    const base = {
      id: mentionId,
      message_id: message.id,
      channel_id: message.channel_id,
      author_id: message.author_id,
      author_username: message.author_username,
      content: message.content,
      mention_type: mention.type,
    };

    if (mention.type === "everyone" || mention.type === "here") {
      // Persist one entry with NULL user — the client side counts these
      db.prepare(
        `INSERT OR IGNORE INTO mentions
         (id, message_id, channel_id, author_id, author_username, content, mention_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        mentionId,
        message.id,
        message.channel_id,
        message.author_id,
        message.author_username,
        message.content,
        mention.type,
      );

      // Broadcast to notification room — every subscriber gets it
      io.to(NOTIFICATION_ROOM).emit("message:mention", {
        ...base,
        mentionedUserId: null,
      });
    } else {
      // Look up the user by username
      const user = db
        .prepare("SELECT id, username FROM users WHERE username = ?")
        .get(mention.target);

      if (!user) continue;

      db.prepare(
        `INSERT OR IGNORE INTO mentions
         (id, message_id, channel_id, author_id, author_username, mentioned_user_id, content, mention_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        mentionId,
        message.id,
        message.channel_id,
        message.author_id,
        message.author_username,
        user.id,
        message.content,
        "user",
      );

      // Emit to a per-user notification room
      io.to(`user:${user.id}`).emit("message:mention", {
        ...base,
        mentionedUserId: user.id,
      });
    }
  }
}

function registerChatHandlers(io, socket) {
  // Subscribe to server-wide notifications (background clients join this room)
  socket.on("notification:subscribe", () => {
    socket.join(NOTIFICATION_ROOM);
  });

  // Subscribe to per-user mention room (call after authenticating)
  socket.on("user:subscribe", ({ userId }) => {
    if (userId) {
      socket.join(`user:${userId}`);
      socket.join(`dm:${userId}`);
      socket.userId = userId;
    }
  });

  // DM subscription — for receiving direct messages
  socket.on("dm:subscribe", ({ userId }) => {
    if (userId) {
      socket.join(`dm:${userId}`);
    }
  });
  socket.on("channel:join", (channelId) => {
    socket.join(channelId);
    socket.currentChannel = channelId;
  });

  socket.on("channel:leave", (channelId) => {
    socket.leave(channelId);
  });

  // Send a new message via socket (alternative to REST)
  socket.on(
    "message:send",
    ({ channelId, content, authorId, authorUsername }) => {
      if (!channelId || !content?.trim() || !authorId) return;
      if (content.length > 4000) return;

      // Enforce send_messages permission
      const userInfo = getUserPermissions(authorId);
      if (!hasPermission(userInfo, "send_messages")) {
        socket.emit("error", {
          code: "FORBIDDEN",
          message: "You do not have permission to send messages",
        });
        return;
      }

      const db = getDb();
      const id = uuidv4();
      db.prepare(
        `INSERT INTO messages (id, channel_id, author_id, author_username, content)
       VALUES (?, ?, ?, ?, ?)`,
      ).run(id, channelId, authorId, authorUsername, content.trim());

      const row = db
        .prepare(
          `SELECT m.*, u.display_name, u.avatar
           FROM messages m
           LEFT JOIN users u ON m.author_id = u.id
           WHERE m.id = ?`,
        )
        .get(id);
      const message = {
        id: row.id,
        channel_id: row.channel_id,
        user_id: row.author_id,
        username: row.author_username,
        display_name: row.display_name || row.author_username,
        avatar: row.avatar || undefined,
        content: row.content,
        created_at: row.created_at * 1000,
      };
      io.to(channelId).emit("message:new", message);
      io.to(NOTIFICATION_ROOM).emit("message:new", message);

      // Parse and emit @mentions
      const mentions = parseMentions(content.trim());
      processMentions(io, message, mentions);
    },
  );

  // Mark mentions as read for a specific channel (called when user opens the channel)
  socket.on("mentions:read", ({ userId, channelId }) => {
    if (!userId) return;
    const db = getDb();
    if (channelId) {
      db.prepare(
        `UPDATE mentions SET read = 1
         WHERE (mentioned_user_id = ? OR mention_type IN ('everyone', 'here'))
           AND channel_id = ? AND read = 0`,
      ).run(userId, channelId);
    } else {
      db.prepare(
        `UPDATE mentions SET read = 1
         WHERE (mentioned_user_id = ? OR mention_type IN ('everyone', 'here')) AND read = 0`,
      ).run(userId);
    }
  });

  // Mark channel as read (for read receipts)
  socket.on("channel:read", ({ userId, channelId }, callback) => {
    if (!userId || !channelId) return;
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    
    db.prepare(
      `INSERT INTO channel_reads (user_id, channel_id, last_read_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id, channel_id) DO UPDATE SET last_read_at = excluded.last_read_at`,
    ).run(userId, channelId, now);
    
    if (typeof callback === "function") {
      callback({ success: true, last_read_at: now * 1000 });
    }
  });

  // Mark DM channel as read
  socket.on("dm:read", ({ userId, channelId }, callback) => {
    if (!userId || !channelId) return;
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    
    db.prepare(
      `INSERT INTO dm_reads (user_id, channel_id, last_read_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id, channel_id) DO UPDATE SET last_read_at = excluded.last_read_at`,
    ).run(userId, channelId, now);
    
    // Notify the other user that their messages were read
    const channel = db.prepare(`SELECT user1_id, user2_id FROM dm_channels WHERE id = ?`).get(channelId);
    if (channel) {
      const otherUserId = channel.user1_id === userId ? channel.user2_id : channel.user1_id;
      socket.to(`user:${otherUserId}`).emit("dm:read", { channelId, readBy: userId, readAt: now * 1000 });
    }
    
    if (typeof callback === "function") {
      callback({ success: true, last_read_at: now * 1000 });
    }
  });

  // Get unread message counts per channel
  socket.on("channel:unread", ({ userId }, callback) => {
    if (!userId || typeof callback !== "function") return;
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT cr.channel_id, cr.last_read_at
         FROM channel_reads cr
         WHERE cr.user_id = ?`,
      )
      .all(userId);
    
    const lastRead = new Map(rows.map(r => [r.channel_id, r.last_read_at]));
    const channels = db.prepare(`SELECT id FROM channels WHERE type = 'text'`).all();
    
    const unreadCounts = {};
    for (const ch of channels) {
      const threshold = lastRead.get(ch.id) || 0;
      const count = db
        .prepare(
          `SELECT COUNT(*) as count FROM messages WHERE channel_id = ? AND created_at > ?`,
        )
        .get(ch.id, threshold);
      if (count.count > 0) {
        unreadCounts[ch.id] = count.count;
      }
    }
    
    callback(unreadCounts);
  });

  // Return unread mention counts per channel (so badge can reflect accurate state on reconnect)
  socket.on("mentions:unread", ({ userId }, callback) => {
    if (!userId || typeof callback !== "function") return;
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT channel_id, COUNT(*) as count FROM mentions
         WHERE (mentioned_user_id = ? OR mention_type IN ('everyone', 'here')) AND read = 0
         GROUP BY channel_id`,
      )
      .all(userId);
    callback(rows);
  });

  // Typing indicator
  socket.on("typing:start", ({ channelId, username }) => {
    socket.to(channelId).emit("typing:start", { username });
  });

  socket.on("typing:stop", ({ channelId, username }) => {
    socket.to(channelId).emit("typing:stop", { username });
  });

  // Direct message
  socket.on("dm:send", ({ toSocketId, fromId, fromUsername, content }) => {
    if (!toSocketId || !content?.trim()) return;

    const db = getDb();
    const id = uuidv4();
    db.prepare(
      `INSERT INTO direct_messages (id, from_id, from_username, to_id, content)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(id, fromId, fromUsername, toSocketId, content.trim());

    const dm = {
      id,
      fromId,
      fromUsername,
      content: content.trim(),
      created_at: Date.now(),
    };
    io.to(toSocketId).emit("dm:received", dm);
    socket.emit("dm:sent", dm);
  });

  // User joins server — broadcast presence
  socket.on("user:joined", ({ userId, username }) => {
    socket.userId = userId;
    socket.username = username;
    
    // Update last_seen_at for presence tracking
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    try {
      db.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?").run(now, userId);
    } catch {
      // Ignore errors if user doesn't exist
    }
    
    socket.broadcast.emit("user:online", {
      userId,
      username,
      socketId: socket.id,
    });
  });

  // Presence update (call periodically to keep presence fresh)
  socket.on("presence:heartbeat", ({ userId }) => {
    if (!userId) return;
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    try {
      db.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?").run(now, userId);
    } catch {
      // Ignore errors
    }
  });

  socket.on("disconnect", () => {
    if (socket.userId) {
      socket.broadcast.emit("user:offline", { userId: socket.userId });
    }
  });
}

module.exports = { registerChatHandlers, parseMentions, processMentions };
