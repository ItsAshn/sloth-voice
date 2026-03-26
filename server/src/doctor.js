#!/usr/bin/env node

/**
 * Sloth Voice Server Configuration Doctor
 * Validates configuration and diagnoses common issues.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const dns = require("dns").promises;
const http = require("http");

const ENV_PATH = path.join(__dirname, "..", ".env");

const checks = [];
let hasErrors = false;
let hasWarnings = false;

function check(name, fn) {
  checks.push({ name, fn });
}

function pass(message) {
  console.log(`  ✓ ${message}`);
}

function warn(message) {
  console.log(`  ⚠ ${message}`);
  hasWarnings = true;
}

function fail(message) {
  console.log(`  ✗ ${message}`);
  hasErrors = true;
}

function info(message) {
  console.log(`  ℹ ${message}`);
}

async function checkPort(port) {
  return new Promise((resolve) => {
    const server = require("net").createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

async function checkHttp(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 5000 }, (res) => {
      resolve({ ok: res.statusCode < 500, status: res.statusCode });
    });
    req.on("error", (err) => resolve({ ok: false, error: err.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: "timeout" });
    });
  });
}

async function resolvePublicIP() {
  const services = [
    "https://api.ipify.org?format=text",
    "https://icanhazip.com",
    "https://ifconfig.me/ip",
  ];
  for (const service of services) {
    try {
      const result = await checkHttp(service);
      if (result.ok) return result;
    } catch {}
  }
  return null;
}

// ─── Checks ───────────────────────────────────────────────────────────────

check("Environment file exists", async () => {
  if (fs.existsSync(ENV_PATH)) {
    pass(".env file found");
    return true;
  }
  fail(".env file not found");
  info("Run 'npm run setup' to create configuration");
  return false;
});

check("JWT secret is set", async () => {
  require("dotenv").config({ path: ENV_PATH });
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    fail("JWT_SECRET is not set");
    info("Run 'npm run setup' or set JWT_SECRET in .env");
    return false;
  }
  if (secret === "change_this_to_a_long_random_secret" || secret.length < 32) {
    fail("JWT_SECRET is using a weak or default value");
    info("Generate a secure secret: openssl rand -hex 64");
    return false;
  }
  pass("JWT_SECRET is configured");
  return true;
});

check("Server port is available", async () => {
  const port = parseInt(process.env.SERVER_PORT || "5000", 10);
  const available = await checkPort(port);
  if (available) {
    pass(`Port ${port} is available`);
    return true;
  }
  fail(`Port ${port} is in use`);
  info(`Free the port or change SERVER_PORT in .env`);
  return false;
});

check("Database path is writable", async () => {
  const dbPath = process.env.SERVER_DB_PATH || "./server.db";
  const fullPath = path.resolve(path.dirname(ENV_PATH), dbPath);
  const dir = path.dirname(fullPath);
  try {
    fs.accessSync(dir, fs.constants.W_OK);
    pass(`Database directory is writable`);
    return true;
  } catch {
    fail(`Database directory is not writable: ${dir}`);
    return false;
  }
});

check("Public address configuration", async () => {
  const publicAddress = process.env.PUBLIC_ADDRESS;
  if (!publicAddress) {
    info("PUBLIC_ADDRESS not set (will auto-detect)");
    return true;
  }
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(publicAddress)) {
    pass("PUBLIC_ADDRESS is a valid IPv4 address");
    return true;
  }
  try {
    const addresses = await dns.resolve4(publicAddress);
    if (addresses.length > 0) {
      pass(`PUBLIC_ADDRESS resolves to ${addresses[0]}`);
      return true;
    }
  } catch {
    warn(`PUBLIC_ADDRESS is set but could not resolve: ${publicAddress}`);
    info("If using DDNS, ensure the hostname resolves to an IPv4 address");
    return false;
  }
  return false;
});

check("RTC port range", async () => {
  const minPort = parseInt(process.env.RTC_MIN_PORT || "40000", 10);
  const maxPort = parseInt(process.env.RTC_MAX_PORT || "40099", 10);
  const range = maxPort - minPort + 1;

  if (minPort >= maxPort) {
    fail(`Invalid port range: RTC_MIN_PORT (${minPort}) >= RTC_MAX_PORT (${maxPort})`);
    return false;
  }
  if (range < 10) {
    warn(`Port range is narrow (${range} ports). This may limit concurrent voice users.`);
    return false;
  }
  if (range > 1000) {
    warn(`Port range is large (${range} ports). Consider narrowing for UPnP compatibility.`);
  }
  pass(`RTC port range: ${minPort}-${maxPort} (${range} ports)`);
  return true;
});

check("Node.js version", async () => {
  const version = process.versions.node;
  const major = parseInt(version.split(".")[0], 10);
  if (major <20) {
    fail(`Node.js version ${version} is too old. Requires Node.js 20+`);
    return false;
  }
  pass(`Node.js version ${version}`);
  return true;
});

check("SQLite experimental flag", async () => {
  const execArgv = process.execArgv.join(" ");
  if (!execArgv.includes("--experimental-sqlite")) {
    warn("--experimental-sqlite flag may be missing");
    info("SQLite requires --experimental-sqlite in Node.js 20-21");
    return false;
  }
  pass("--experimental-sqlite flag is set");
  return true;
});

check("mediasoup native modules", async () => {
  try {
    require.resolve("mediasoup");
    pass("mediasoup is installed");
    return true;
  } catch {
    fail("mediasoup is not installed or failed to build");
    info("Run 'npm install' in the server directory");
    return false;
  }
});

check("UPnP availability (optional)", async () => {
  const upnpEnabled = process.env.UPNP_ENABLED !== "false";
  if (!upnpEnabled) {
    info("UPnP is disabled");
    return true;
  }
  try {
    const natUPnP = require("nat-upnp");
    pass("nat-upnp is available for UPnP");
    return true;
  } catch {
    warn("nat-upnp is not installed. UPnP will be unavailable.");
    info("Run 'npm install nat-upnp' for automatic port forwarding");
    return false;
  }
});

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🦥  Sloth Voice Configuration Doctor\n");

  for (const { name, fn } of checks) {
    console.log(`\n${name}:`);
    try {
      await fn();
    } catch (err) {
      fail(`Check failed: ${err.message}`);
    }
  }

  console.log("\n" + "─".repeat(50) + "\n");

  if (hasErrors) {
    console.log("❌ Configuration has errors. Fix the issues above and run again.\n");
    process.exit(1);
  }

  if (hasWarnings) {
    console.log("⚠️  Configuration has warnings. Review before deploying.\n");
    process.exit(0);
  }

  console.log("✅ Configuration looks good!\n");
  console.log("Run 'npm start' to start the server.\n");
}

main().catch((err) => {
  console.error("\n❌ Doctor failed:", err.message);
  process.exit(1);
});