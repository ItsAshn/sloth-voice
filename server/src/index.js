require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { initDb, initDbAsync } = require("./db/database");
const { createWorker } = require("./mediasoup/worker");

const authRoutes = require("./routes/auth");
const channelRoutes = require("./routes/channels");
const messageRoutes = require("./routes/messages");
const serverInfoRoutes = require("./routes/serverInfo");
const roleRoutes = require("./routes/roles");
const dmRoutes = require("./routes/dms");
const attachmentRoutes = require("./routes/attachments");
const { authLimiter, messageLimiter, uploadLimiter, apiLimiter } = require("./middleware/rateLimiter");
const { registerChatHandlers } = require("./socket/chatHandler");
const { registerVoiceHandlers } = require("./socket/voiceHandler");
const { openPorts, registerShutdownHook } = require("./upnp");
const { resolvePublicAddress, startIpWatcher } = require("./publicAddress");

// Uploads directory for file attachments
const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, "../uploads");

function printBanner() {
  console.log(`
 ╭───────────────────────────────────────────────────────────╮
 │                                                           │
 │   🦥 Sloth Voice Server                                   │
 │                                                           │
 ╰───────────────────────────────────────────────────────────╯
`);
}

function checkEnvFile() {
  // Skip check if running in Docker with env vars already set
  if (process.env.JWT_SECRET) {
    return;
  }

  const envPath = path.join(__dirname, "..", ".env");
  const envExamplePath = path.join(__dirname, "..", ".env.example");

  if (!fs.existsSync(envPath)) {
    if (fs.existsSync(envExamplePath)) {
      console.error(
        "\n[!] No .env file found.\n" +
        "    Run 'npm run setup' to create configuration interactively,\n" +
        "    or copy .env.example to .env and edit it manually.\n"
      );
    } else {
      console.error(
        "\n[!] No .env file found.\n" +
        "    Run 'npm run setup' to create configuration.\n"
      );
    }
    process.exit(1);
  }
}

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use((req, _res, next) => {
  req.io = io;
  next();
});

// Routes with rate limiting
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/channels", apiLimiter, channelRoutes);
app.use("/api/messages", messageLimiter, messageRoutes);
app.use("/api/server", apiLimiter, serverInfoRoutes);
app.use("/api/roles", apiLimiter, roleRoutes);
app.use("/api/dms", messageLimiter, dmRoutes);
app.use("/api/attachments", uploadLimiter, attachmentRoutes);

// Static file serving for uploads
app.use("/uploads", express.static(uploadsDir));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    name: process.env.SERVER_NAME || "Sloth Voice Server",
    version: "1.0.0",
    passwordProtected: !!(
      process.env.SERVER_PASSWORD && process.env.SERVER_PASSWORD.trim()
    ),
  });
});

io.on("connection", (socket) => {
  console.log(`[+] Client connected: ${socket.id}`);
  registerChatHandlers(io, socket);
  registerVoiceHandlers(io, socket);
  socket.on("disconnect", () =>
    console.log(`[-] Client disconnected: ${socket.id}`),
  );
});

const PORT = parseInt(process.env.SERVER_PORT || "5000", 10);
const RTC_MIN = parseInt(process.env.RTC_MIN_PORT || "40000", 10);
const RTC_MAX = parseInt(process.env.RTC_MAX_PORT || "49999", 10);
const SERVER_NAME = process.env.SERVER_NAME || "My Sloth Voice Server";

async function start() {
  printBanner();

  // Check for .env file
  checkEnvFile();

  // Fail fast if JWT_SECRET is not configured
  if (
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET === "change_this_to_a_long_random_secret"
  ) {
    console.error(
      "\n[!] JWT_SECRET is not set or using default placeholder.\n" +
        "    This value must be a strong random string.\n" +
        "    \n" +
        "    Generate one with:\n" +
        "      openssl rand -hex 64\n" +
        "    \n" +
        "    Then set it in your .env file:\n" +
        "      JWT_SECRET=<your-generated-secret>\n" +
        "    \n" +
        "    Or run 'npm run setup' for interactive configuration.\n"
    );
    process.exit(1);
  }

  console.log("[✓] Configuration validated");

  // Initialize database
  try {
    if (process.env.DB_TYPE === "postgres") {
      await initDbAsync();
    } else {
      initDb();
    }
    console.log("[✓] Database initialized");
  } catch (err) {
    console.error("[!] Failed to initialize database:", err.message);
    console.error("    Check SERVER_DB_PATH in your .env file (SQLite)");
    console.error("    Or PG_HOST, PG_DATABASE, PG_USER, PG_PASSWORD (PostgreSQL)");
    process.exit(1);
  }

  // Register clean-up hooks before opening ports so Ctrl-C removes them.
  registerShutdownHook();

  // Attempt UPnP port mapping (non-fatal if unavailable).
  console.log(`[i] Configuring network (UPnP: ${process.env.UPNP_ENABLED !== 'false' ? 'enabled' : 'disabled'})...`);
  const { effectiveRtcMin, effectiveRtcMax } = await openPorts({
    httpPort: PORT,
    rtcMinPort: RTC_MIN,
    rtcMaxPort: RTC_MAX,
  });

  // Apply the (possibly clamped) range before the worker reads from env.
  process.env.RTC_MIN_PORT = String(effectiveRtcMin);
  process.env.RTC_MAX_PORT = String(effectiveRtcMax);

  if (effectiveRtcMax - effectiveRtcMin + 1 < RTC_MAX - RTC_MIN + 1) {
    console.log(
      `[i] RTC port range clamped: ${effectiveRtcMin}-${effectiveRtcMax} ` +
        `(UPnP limit, ${effectiveRtcMax - effectiveRtcMin + 1} ports)`
    );
  }

  // Resolve PUBLIC_ADDRESS to a bare IPv4
  console.log("[i] Resolving public address...");
  try {
    await resolvePublicAddress();
    const addr = process.env.PUBLIC_ADDRESS || "auto-detected";
    console.log(`[✓] Public address: ${addr}`);
  } catch (err) {
    console.warn(
      `[!] Could not resolve public address: ${err.message}\n` +
      "    Voice may not work for external clients.\n" +
      "    Set PUBLIC_ADDRESS in .env if you know your IP."
    );
  }
  startIpWatcher();

  // Start mediasoup worker
  console.log("[i] Starting voice server...");
  try {
    await createWorker();
    console.log("[✓] Media worker started");
  } catch (err) {
    console.error("[!] Failed to start mediasoup worker:", err.message);
    console.error("    Voice will not be available.");
    console.error("    On Linux, ensure build tools are installed:");
    console.error("      apt-get install build-essential python3");
  }

  // Start HTTP server
  httpServer.listen(PORT, () => {
    console.log(`\n[✓] Server "${SERVER_NAME}" running`);
    console.log(`[i] HTTP:       http://localhost:${PORT}`);
    console.log(`[i] Health:     http://localhost:${PORT}/health`);
    console.log(`[i] Voice:      UDP ${process.env.RTC_MIN_PORT}-${process.env.RTC_MAX_PORT}`);
    console.log("");
    console.log("Connect with the Sloth Voice desktop client.");
    console.log("Press Ctrl+C to stop.\n");
  });

  // Graceful shutdown
  const shutdown = (signal) => {
    console.log(`\n[${signal}] Shutting down gracefully…`);
    io.close();
    httpServer.close(() => {
      console.log("[✓] HTTP server closed.");
      process.exit(0);
    });
    // Force exit after 5 s if connections hang
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch((err) => {
  console.error("\n[!] Server failed to start:", err.message);
  console.error("    Run 'npm run doctor' to check your configuration.");
  process.exit(1);
});
