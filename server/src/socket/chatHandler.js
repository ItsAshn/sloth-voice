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

      const message = db.prepare("SELECT * FROM messages WHERE id = ?").get(id);
      // Broadcast to channel members (normal chat)
      io.to(channelId).emit("message:new", message);
      // Also forward to background-notification subscribers so they get it
      // even when they haven't joined the specific channel room
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
    socket.broadcast.emit("user:online", {
      userId,
      username,
      socketId: socket.id,
    });
  });

  socket.on("disconnect", () => {
    if (socket.userId) {
      socket.broadcast.emit("user:offline", { userId: socket.userId });
    }
  });
}

module.exports = { registerChatHandlers, parseMentions, processMentions };
