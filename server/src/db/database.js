const { DatabaseSync } = require("node:sqlite");
const path = require("path");

const DB_PATH =
  process.env.SERVER_DB_PATH || path.join(__dirname, "../../server.db");
let db;

function getDb() {
  if (!db) db = new DatabaseSync(DB_PATH);
  return db;
}

function initDb() {
  const database = getDb();
  // Run incremental migrations first so new tables are added to existing DBs
  runMigrations(database);
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      avatar TEXT DEFAULT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'text',
      topic TEXT DEFAULT NULL,
      position INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      author_username TEXT NOT NULL,
      content TEXT NOT NULL,
      edited_at INTEGER DEFAULT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (channel_id) REFERENCES channels(id)
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      url TEXT NOT NULL,
      size INTEGER,
      FOREIGN KEY (message_id) REFERENCES messages(id)
    );

    CREATE TABLE IF NOT EXISTS direct_messages (
      id TEXT PRIMARY KEY,
      from_id TEXT NOT NULL,
      from_username TEXT NOT NULL,
      to_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS server_members (
      user_id TEXT PRIMARY KEY,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS mentions (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      author_username TEXT NOT NULL,
      mentioned_user_id TEXT,          -- NULL means @everyone / @here
      mention_type TEXT NOT NULL DEFAULT 'user',  -- 'user' | 'everyone' | 'here'
      content TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (message_id) REFERENCES messages(id)
    );

    CREATE TABLE IF NOT EXISTS server_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Seed default channels if none exist
    INSERT OR IGNORE INTO channels (id, name, type, position) VALUES
      ('general', 'general', 'text', 0),
      ('announcements', 'announcements', 'text', 1),
      ('voice-1', 'Voice 1', 'voice', 2),
      ('voice-2', 'Voice 2', 'voice', 3);
  `);
  console.log("✅ Local server database initialized");
}

// Incremental migrations — safe to run on every startup
function runMigrations(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS server_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invite_codes (
      code TEXT PRIMARY KEY,
      created_by TEXT NOT NULL,
      max_uses INTEGER DEFAULT NULL,       -- NULL = unlimited
      uses INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER DEFAULT NULL,     -- NULL = never expires (unix seconds)
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#5865f2',
      permissions TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS dm_channels (
      id TEXT PRIMARY KEY,
      user1_id TEXT NOT NULL,
      user2_id TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (user1_id) REFERENCES users(id),
      FOREIGN KEY (user2_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_dm_channels_users ON dm_channels(user1_id, user2_id);
  `);

  // Add custom_role_id column to server_members — idempotent
  try {
    database.exec(
      `ALTER TABLE server_members ADD COLUMN custom_role_id TEXT DEFAULT NULL REFERENCES roles(id)`,
    );
  } catch {
    // column already exists — safe to ignore
  }

  // Add last_message_at column to dm_channels — idempotent
  try {
    database.exec(
      `ALTER TABLE dm_channels ADD COLUMN last_message_at INTEGER DEFAULT NULL`,
    );
  } catch {
    // column already exists — safe to ignore
  }

  // Add channel_id column to direct_messages — idempotent
  try {
    database.exec(
      `ALTER TABLE direct_messages ADD COLUMN channel_id TEXT DEFAULT NULL`,
    );
  } catch {
    // column already exists — safe to ignore
  }
}

module.exports = { getDb, initDb };
