#!/usr/bin/env node
/**
 * Reset the database - drops all tables and recreates schema
 * 
 * Usage:
 *   npm run db:reset
 *   npm run db:reset -- --force  (skip confirmation)
 *   npm run db:reset -- -y       (skip confirmation)
 * 
 * WARNING: This will delete ALL data permanently.
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const readline = require("readline");

const DB_TYPE = process.env.DB_TYPE || "sqlite";

function shouldSkipConfirmation() {
  return process.argv.includes("--force") || process.argv.includes("-y");
}

async function promptConfirmation() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log('\n========================================');
    console.log('      DATABASE RESET WARNING');
    console.log('========================================');
    console.log(`Database type: ${DB_TYPE}`);
    console.log(`This will DELETE ALL DATA permanently!`);
    console.log('========================================\n');

    rl.question('Type "RESET" to confirm: ', (answer) => {
      rl.close();
      resolve(answer.trim() === "RESET");
    });
  });
}

async function resetSqlite() {
  const { resetSqliteDb } = require("../src/db/database");
  console.log("\n[i] Resetting SQLite database...");
  resetSqliteDb();
}

async function resetPostgres() {
  const { resetPostgresDb } = require("../src/db/database");
  console.log("\n[i] Resetting PostgreSQL database...");
  await resetPostgresDb();
}

async function main() {
  console.log(`\n[+] Database type: ${DB_TYPE}`);

  if (!shouldSkipConfirmation()) {
    const confirmed = await promptConfirmation();
    if (!confirmed) {
      console.log("\n Aborted. No changes were made.");
      process.exit(0);
    }
  }

  try {
    if (DB_TYPE === "postgres") {
      await resetPostgres();
    } else {
      await resetSqlite();
    }

    console.log("\n========================================");
    console.log(" Database reset complete!");
    console.log("========================================");
    console.log("\nNext steps:");
    console.log("  1. Restart your server: npm run dev");
    console.log("  2. Create a new admin account");
    console.log("");

    process.exit(0);
  } catch (err) {
    console.error("\n[!] Failed to reset database:", err.message);
    console.error("    Full error:", err);
    process.exit(1);
  }
}

main();