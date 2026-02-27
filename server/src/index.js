require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { initDb } = require("./db/database");
const { createWorker } = require("./mediasoup/worker");

const authRoutes = require("./routes/auth");
const channelRoutes = require("./routes/channels");
const messageRoutes = require("./routes/messages");
const serverInfoRoutes = require("./routes/serverInfo");
const roleRoutes = require("./routes/roles");
const { registerChatHandlers } = require("./socket/chatHandler");
const { registerVoiceHandlers } = require("./socket/voiceHandler");
const { openPorts, registerShutdownHook } = require("./upnp");
const { resolvePublicAddress, startIpWatcher } = require("./publicAddress");

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

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/channels", channelRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/server", serverInfoRoutes);
app.use("/api/roles", roleRoutes);

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
  // Fail fast if JWT_SECRET is not configured — the default is insecure.
  if (
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET === "change_this_to_a_long_random_secret"
  ) {
    console.error(
      "\n[!] JWT_SECRET is not set (or still the placeholder value).\n" +
        "    Set a strong random secret in your .env file or environment.\n" +
        "    Example:  JWT_SECRET=$(openssl rand -base64 48)\n",
    );
    process.exit(1);
  }

  initDb();

  // Register clean-up hooks before opening ports so Ctrl-C removes them.
  registerShutdownHook();

  // Attempt UPnP port mapping (non-fatal if unavailable).
  // openPorts clamps the RTC range to UPNP_RTC_MAX_PORTS and returns the
  // effective range so mediasoup uses the exact ports that were forwarded.
  const { effectiveRtcMin, effectiveRtcMax } = await openPorts({
    httpPort: PORT,
    rtcMinPort: RTC_MIN,
    rtcMaxPort: RTC_MAX,
  });

  // Apply the (possibly clamped) range before the worker reads from env.
  process.env.RTC_MIN_PORT = String(effectiveRtcMin);
  process.env.RTC_MAX_PORT = String(effectiveRtcMax);

  // Resolve PUBLIC_ADDRESS to a bare IPv4 — supports static IPs, DDNS
  // hostnames, and fully automatic detection via public IP-echo services.
  // The watcher keeps it current if the IP changes (ISP reassignment, DDNS
  // propagation, etc.) so voice stays working without a server restart.
  await resolvePublicAddress();
  startIpWatcher();

  await createWorker();

  httpServer.listen(PORT, () => {
    console.log(
      `\n Sloth Voice Server "${SERVER_NAME}" running on port ${PORT}`,
    );
    console.log(`   Health: http://localhost:${PORT}/health\n`);
  });

  // Graceful shutdown — close HTTP + Socket.IO so in-flight requests finish
  const shutdown = (signal) => {
    console.log(`\n[${signal}] Shutting down gracefully…`);
    io.close();
    httpServer.close(() => {
      console.log("[+] HTTP server closed.");
      process.exit(0);
    });
    // Force exit after 5 s if connections hang
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch(console.error);
