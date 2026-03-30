const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const fs = require("fs");

const DB_TYPE = process.env.DB_TYPE || "sqlite";
const DB_PATH =
  process.env.SERVER_DB_PATH || path.join(__dirname, "../../server.db");

const PG_CONFIG = {
  host: process.env.PG_HOST || "localhost",
  port: parseInt(process.env.PG_PORT || "5432", 10),
  database: process.env.PG_DATABASE || "slothvoice",
  user: process.env.PG_USER || "postgres",
  password: process.env.PG_PASSWORD || "",
  max: parseInt(process.env.PG_POOL_SIZE || "10", 10),
};

let db = null;
let pgPool = null;

function getSqliteDb() {
  if (!db) db = new DatabaseSync(DB_PATH);
  return db;
}

async function getPgPool() {
  if (!pgPool) {
    const { Pool } = require("pg");
    pgPool = new Pool(PG_CONFIG);
    pgPool.on("error", (err) => {
      console.error("[PostgreSQL] Unexpected error on idle client:", err);
    });
  }
  return pgPool;
}

function getDb() {
  if (DB_TYPE === "postgres") {
    throw new Error("PostgreSQL requires async operations - use getDbAsync()");
  }
  return getSqliteDb();
}

async function getDbAsync() {
  if (DB_TYPE === "postgres") {
    return getPgPool();
  }
  return getSqliteDb();
}

function initDb() {
  if (DB_TYPE === "postgres") {
    throw new Error(
      "PostgreSQL initialization is async - use initDbAsync() instead",
    );
  }
  const database = getSqliteDb();
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
      mentioned_user_id TEXT,
      mention_type TEXT NOT NULL DEFAULT 'user',
      content TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (message_id) REFERENCES messages(id)
    );

    CREATE TABLE IF NOT EXISTS server_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    INSERT OR IGNORE INTO channels (id, name, type, position) VALUES
      ('general', 'general', 'text', 0),
      ('announcements', 'announcements', 'text', 1),
      ('voice-1', 'Voice 1', 'voice', 2),
      ('voice-2', 'Voice 2', 'voice', 3);
  `);
  runMigrations(database);
  console.log("✅ Local server database initialized");
}

async function initDbAsync() {
  if (DB_TYPE === "postgres") {
    return initPostgresDb();
  }
  initDb();
}

const POSTGRES_TABLES = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    avatar TEXT DEFAULT NULL,
    last_seen_at BIGINT DEFAULT NULL,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
  );

  CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#5865f2',
    permissions TEXT NOT NULL DEFAULT '{}',
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
  );

  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'text',
    topic TEXT DEFAULT NULL,
    position INTEGER DEFAULT 0,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
  );

  CREATE TABLE IF NOT EXISTS dm_channels (
    id TEXT PRIMARY KEY,
    user1_id TEXT NOT NULL REFERENCES users(id),
    user2_id TEXT NOT NULL REFERENCES users(id),
    last_message_at BIGINT DEFAULT NULL,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
  );

  CREATE TABLE IF NOT EXISTS server_members (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    role TEXT NOT NULL DEFAULT 'member',
    custom_role_id TEXT REFERENCES roles(id),
    joined_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES channels(id),
    author_id TEXT NOT NULL REFERENCES users(id),
    author_username TEXT NOT NULL,
    content TEXT NOT NULL,
    edited_at BIGINT DEFAULT NULL,
    updated_at BIGINT DEFAULT NULL,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
  );

  CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    message_id TEXT REFERENCES messages(id),
    filename TEXT NOT NULL,
    url TEXT NOT NULL,
    size BIGINT,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
  );

  CREATE TABLE IF NOT EXISTS direct_messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT REFERENCES dm_channels(id),
    from_id TEXT NOT NULL REFERENCES users(id),
    from_username TEXT NOT NULL,
    to_id TEXT NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
  );

  CREATE TABLE IF NOT EXISTS mentions (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id),
    channel_id TEXT NOT NULL REFERENCES channels(id),
    author_id TEXT NOT NULL REFERENCES users(id),
    author_username TEXT NOT NULL,
    mentioned_user_id TEXT REFERENCES users(id),
    mention_type TEXT NOT NULL DEFAULT 'user',
    content TEXT NOT NULL,
    read INTEGER NOT NULL DEFAULT 0,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
  );

  CREATE TABLE IF NOT EXISTS server_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS invite_codes (
    code TEXT PRIMARY KEY,
    created_by TEXT NOT NULL REFERENCES users(id),
    max_uses INTEGER DEFAULT NULL,
    uses INTEGER NOT NULL DEFAULT 0,
    expires_at BIGINT DEFAULT NULL,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
  );

  CREATE TABLE IF NOT EXISTS channel_reads (
    user_id TEXT NOT NULL REFERENCES users(id),
    channel_id TEXT NOT NULL REFERENCES channels(id),
    last_read_at BIGINT NOT NULL,
    PRIMARY KEY (user_id, channel_id)
  );

  CREATE TABLE IF NOT EXISTS dm_reads (
    user_id TEXT NOT NULL REFERENCES users(id),
    channel_id TEXT NOT NULL REFERENCES dm_channels(id),
    last_read_at BIGINT NOT NULL,
    PRIMARY KEY (user_id, channel_id)
  );

  CREATE TABLE IF NOT EXISTS message_edits (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id),
    old_content TEXT NOT NULL,
    edited_by TEXT NOT NULL REFERENCES users(id),
    edited_at BIGINT NOT NULL
  );
`;

const POSTGRES_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON messages(channel_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_mentions_user_read ON mentions(mentioned_user_id, read);
  CREATE INDEX IF NOT EXISTS idx_dm_channels_users ON dm_channels(user1_id, user2_id);
  CREATE INDEX IF NOT EXISTS idx_direct_messages_channel ON direct_messages(channel_id);
  CREATE INDEX IF NOT EXISTS idx_message_edits_message ON message_edits(message_id);
`;

const POSTGRES_SEED_CHANNELS = `
  INSERT INTO channels (id, name, type, position)
  VALUES 
    ('general', 'general', 'text', 0),
    ('announcements', 'announcements', 'text', 1),
    ('voice-1', 'Voice 1', 'voice', 2),
    ('voice-2', 'Voice 2', 'voice', 3)
  ON CONFLICT (id) DO NOTHING;
`;

async function initPostgresDb() {
  const { Pool } = require("pg");
  const pool = new Pool(PG_CONFIG);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(POSTGRES_TABLES);
    await client.query(POSTGRES_INDEXES);
    await client.query(POSTGRES_SEED_CHANNELS);

    await client.query("COMMIT");
    console.log("✅ PostgreSQL database initialized");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[!] Failed to initialize PostgreSQL database:", err.message);
    throw err;
  } finally {
    client.release();
  }

  pgPool = pool;
  return pool;
}

const REQUIRED_TABLES = [
  "users",
  "roles",
  "channels",
  "dm_channels",
  "server_members",
  "messages",
  "attachments",
  "direct_messages",
  "mentions",
  "server_settings",
  "invite_codes",
  "channel_reads",
  "dm_reads",
  "message_edits",
];

const REQUIRED_COLUMNS = {
  users: ["id", "username", "display_name", "password_hash", "created_at"],
  roles: ["id", "name", "permissions", "created_at"],
  channels: ["id", "name", "type", "position", "created_at"],
  dm_channels: ["id", "user1_id", "user2_id", "created_at"],
  server_members: ["user_id", "role", "joined_at"],
  messages: ["id", "channel_id", "author_id", "content", "created_at"],
  direct_messages: ["id", "channel_id", "from_id", "to_id", "content", "created_at"],
};

async function validatePostgresSchema(client) {
  const errors = [];

  for (const table of REQUIRED_TABLES) {
    const result = await client.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = $1
      )`,
      [table]
    );
    if (!result.rows[0].exists) {
      errors.push(`Missing table: ${table}`);
    }
  }

  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    for (const column of columns) {
      const result = await client.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = $1 
          AND column_name = $2
        )`,
        [table, column]
      );
      if (!result.rows[0].exists) {
        errors.push(`Missing column: ${table}.${column}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function runMigrations(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS server_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invite_codes (
      code TEXT PRIMARY KEY,
      created_by TEXT NOT NULL,
      max_uses INTEGER DEFAULT NULL,
      uses INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER DEFAULT NULL,
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

  try {
    database.exec(
      `ALTER TABLE server_members ADD COLUMN custom_role_id TEXT DEFAULT NULL REFERENCES roles(id)`,
    );
  } catch {}

  try {
    database.exec(`ALTER TABLE dm_channels ADD COLUMN last_message_at INTEGER DEFAULT NULL`);
  } catch {}

  try {
    database.exec(`ALTER TABLE direct_messages ADD COLUMN channel_id TEXT DEFAULT NULL`);
  } catch {}

  try {
    database.exec(`ALTER TABLE users ADD COLUMN last_seen_at INTEGER DEFAULT NULL`);
  } catch {}

  try {
    database.exec(`ALTER TABLE messages ADD COLUMN updated_at INTEGER DEFAULT NULL`);
  } catch {}

  database.exec(`
    CREATE TABLE IF NOT EXISTS channel_reads (
      user_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      last_read_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, channel_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (channel_id) REFERENCES channels(id)
    );

    CREATE TABLE IF NOT EXISTS dm_reads (
      user_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      last_read_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, channel_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (channel_id) REFERENCES dm_channels(id)
    );

    CREATE TABLE IF NOT EXISTS message_edits (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      old_content TEXT NOT NULL,
      edited_by TEXT NOT NULL,
      edited_at INTEGER NOT NULL,
      FOREIGN KEY (message_id) REFERENCES messages(id),
      FOREIGN KEY (edited_by) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON messages(channel_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_mentions_user_read ON mentions(mentioned_user_id, read);
    CREATE INDEX IF NOT EXISTS idx_direct_messages_channel ON direct_messages(channel_id);
    CREATE INDEX IF NOT EXISTS idx_message_edits_message ON message_edits(message_id);
  `);

  console.log("✅ Migrations completed");
}

function resetSqliteDb() {
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
    console.log(` Deleted SQLite database: ${DB_PATH}`);
  }
  initDb();
}

async function resetPostgresDb() {
  const { Pool } = require("pg");
  const pool = new Pool(PG_CONFIG);

  const client = await pool.connect();
  try {
    console.log("Dropping all PostgreSQL tables...");
    
    const tables = [
      "message_edits", "dm_reads", "channel_reads", "invite_codes",
      "mentions", "direct_messages", "attachments", "messages",
      "server_members", "dm_channels", "roles", "channels",
      "server_settings", "users",
    ];

    for (const table of tables) {
      await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
    }

    console.log("All tables dropped. Reinitializing schema...");

    await client.query("BEGIN");
    await client.query(POSTGRES_TABLES);
    await client.query(POSTGRES_INDEXES);
    await client.query(POSTGRES_SEED_CHANNELS);
    await client.query("COMMIT");

    console.log("✅ PostgreSQL database reset complete");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[!] Failed to reset PostgreSQL database:", err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

async function resetDb() {
  if (DB_TYPE === "postgres") {
    return resetPostgresDb();
  }
  resetSqliteDb();
}

async function closeDb() {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
}

module.exports = {
  getDb,
  getDbAsync,
  initDb,
  initDbAsync,
  closeDb,
  resetDb,
  resetPostgresDb,
  resetSqliteDb,
  validatePostgresSchema,
  DB_TYPE,
};