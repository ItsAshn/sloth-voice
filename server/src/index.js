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
    name: process.env.SERVER_NAME || "Discard Server",
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
const SERVER_NAME = process.env.SERVER_NAME || "My Discard Server";

async function start() {
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

  await createWorker();

  httpServer.listen(PORT, () => {
    console.log(`\n Discard Server "${SERVER_NAME}" running on port ${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health\n`);
  });
}

start().catch(console.error);
