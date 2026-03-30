#!/usr/bin/env node
/**
 * Migrate data from SQLite to PostgreSQL
 * 
 * Usage:
 *   1. Ensure both databases are configured in .env
 *   2. Run: node scripts/migrate-to-postgres.js
 */

const { DatabaseSync } = require("node:sqlite");
const { Pool } = require("pg");
const path = require("path");
require("dotenv").config();

const DB_TYPE = process.env.DB_TYPE;
const DB_PATH = process.env.SERVER_DB_PATH || path.join(__dirname, "../server.db");

if (DB_TYPE === "postgres") {
  console.error("Error: DB_TYPE is already set to postgres. This script migrates FROM sqlite TO postgres.");
  console.error("To run migration, temporarily set DB_TYPE=sqlite in .env");
  process.exit(1);
}

const PG_CONFIG = {
  host: process.env.PG_HOST || "localhost",
  port: parseInt(process.env.PG_PORT || "5432", 10),
  database: process.env.PG_DATABASE || "slothvoice",
  user: process.env.PG_USER || "postgres",
  password: process.env.PG_PASSWORD || "",
};

async function migrate() {
  console.log("Connecting to SQLite database...");
  const sqlite = new DatabaseSync(DB_PATH);
  
  console.log("Connecting to PostgreSQL database...");
  const pg = new Pool(PG_CONFIG);
  
  try {
    // Test PostgreSQL connection
    await pg.query("SELECT 1");
    console.log("PostgreSQL connection successful");
    
    // Migrate each table
    const tables = [
      "users",
      "channels", 
      "messages",
      "attachments",
      "direct_messages",
      "dm_channels",
      "server_members",
      "mentions",
      "roles",
      "server_settings",
      "invite_codes",
      "channel_reads",
      "dm_reads",
      "message_edits",
    ];
    
    for (const table of tables) {
      console.log(`Migrating table: ${table}`);
      
      // Check if table exists in SQLite
      const tableExists = sqlite
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
        .get(table);
      
      if (!tableExists) {
        console.log(`  Table ${table} does not exist in SQLite, skipping`);
        continue;
      }
      
      // Get all rows from SQLite
      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
      
      if (rows.length === 0) {
        console.log(`  No rows in ${table}, skipping`);
        continue;
      }
      
      console.log(`  Found ${rows.length} rows`);
      
      // Insert into PostgreSQL
      for (const row of rows) {
        const columns = Object.keys(row);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
        const values = Object.values(row).map(v => {
          // Convert SQLite null to PostgreSQL null
          if (v === null) return null;
          // SQLite stores timestamps as Unix seconds, PostgreSQL expects them in many places
          return v;
        });
        
        const query = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
        
        try {
          await pg.query(query, values);
        } catch (err) {
          // Ignore duplicate key errors
          if (!err.message.includes("duplicate key") && !err.message.includes("unique constraint")) {
            console.error(`  Error inserting row in ${table}:`, err.message);
          }
        }
      }
    }
    
    console.log("\n✅ Migration completed successfully!");
    console.log("\nNext steps:");
    console.log("  1. Update .env: DB_TYPE=postgres");
    console.log("  2. Restart the server");
    console.log("  3. Verify data integrity");
    console.log("  4. Backup and optionally delete the SQLite file");
    
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    sqlite.close();
    await pg.end();
  }
}

migrate();