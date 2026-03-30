# Database Migrations

Sloth Voice Server supports two database backends:

## SQLite (Default)

SQLite is the default database, suitable for small to medium deployments (up to ~100 concurrent users). No additional setup is required - the database file is created automatically.

Configuration in `.env`:
```
DB_TYPE=sqlite
SERVER_DB_PATH=./server.db
```

## PostgreSQL

For larger deployments (100+ concurrent users), PostgreSQL is recommended for better concurrency handling.

### Setup

1. Install PostgreSQL or use Docker:
```bash
docker-compose -f docker-compose.postgres.yml up -d
```

2. Create the database:
```bash
docker exec -it slothvoice-db psql -U slothvoice -c "CREATE DATABASE slothvoice;"
```

3. Update `.env`:
```
DB_TYPE=postgres
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=slothvoice
PG_USER=slothvoice
PG_PASSWORD=your_secure_password
```

4. Start the server - tables will be created automatically.

### Migrating from SQLite toPostgreSQL

A migration script is available to export SQLite data and import into PostgreSQL:

```bash
# With both databases configured
npm run migrate:sqlite-to-pg
```

## Schema Changes

The following tables and columns have been added:

### v0.11.0
- `users.last_seen_at` - Presence tracking timestamp
- `messages.updated_at` - Edit timestamp
- `message_edits` - Edit history table
- `channel_reads` - Read receipts for channels
- `dm_reads` - Read receipts for DMs

### Indexes
- `idx_messages_channel_created` - Faster message pagination
- `idx_mentions_user_read` - Faster unread mention queries
- `idx_dm_channels_users` - Faster DM channel lookup
- `idx_direct_messages_channel` - Faster DM message queries
- `idx_message_edits_message` - Faster edit history lookup