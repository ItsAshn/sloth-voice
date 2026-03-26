/**
 * Mediasoup SFU signaling via Socket.io
 *
 * Protocol (client ↔ server):
 *
 *  Client emits                                           Server responds / broadcasts
 *  ──────────────────────────────────────────────────── ──────────────────────────────────────────
 *  voice:join  { channelId, username, userId }           callback({ rtpCapabilities, peers[] })
 *  voice:createTransport { channelId, direction }        callback(TransportOptions)
 *  voice:connectTransport { channelId, transportId, dtlsParameters }  callback({ ok })
 *  voice:produce { channelId, transportId, kind, rtpParameters }      callback({ id })
 *    └─ server broadcasts voice:newPeer to existing peers after first produce
 *  voice:consume { channelId, peerId, rtpCapabilities }  callback(ConsumerOptions)
 *  voice:resumeConsumer { channelId, consumerId }        callback()
 *  voice:leave { channelId }
 *  voice:speaking { channelId, speaking }                broadcasts voice:peerSpeaking to other peers
 *  voice:setBitrate { channelId, transportId, maxBitrateKbps }
 *
 *  Server → Client events:
 *  voice:newPeer  { peerId, userId, username }           (new peer is now producing)
 *  voice:peerLeft { peerId }
 *  voice:consumerClosed { consumerId }
 */

const { getWorker } = require("../mediasoup/worker");
const jwt = require("jsonwebtoken");
const { getDb } = require("../db/database");

function getIceServers() {
  const servers = [];
  const stunServers = (process.env.STUN_SERVERS ||"stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const url of stunServers) {
    servers.push({ urls: url });
  }
  if (process.env.TURN_ENABLED === "true" && process.env.TURN_URL) {
    const turnConfig = {
      urls: process.env.TURN_URL,
    };
    if (process.env.TURN_USERNAME) turnConfig.username = process.env.TURN_USERNAME;
    if (process.env.TURN_PASSWORD) turnConfig.credential = process.env.TURN_PASSWORD;
    servers.push(turnConfig);
  }
  return servers;
}

// channelId -> { router, peers: Map<socketId, PeerState> }
const voiceRooms = new Map();

const MEDIA_CODECS = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
    parameters: { "x-google-start-bitrate": 1000 },
  },
];

async function getOrCreateRoom(channelId) {
  if (voiceRooms.has(channelId)) return voiceRooms.get(channelId);
  const worker = getWorker();
  const router = await worker.createRouter({ mediaCodecs: MEDIA_CODECS });
  const room = {
    router,
    peers: new Map(), // socketId -> PeerState
  };
  voiceRooms.set(channelId, room);
  return room;
}

function registerVoiceHandlers(io, socket) {
  // ── Join ─────────────────────────────────────────────────────────────────
  // Returns router RTP capabilities + list of peers that are ALREADY producing.
  // We do NOT broadcast voice:newPeer here; that fires from voice:produce so
  // existing peers never try to consume a peer before it has a producer.
  socket.on("voice:join", async ({ channelId, userId, username }, callback) => {
    try {
      // Verify the socket's auth token before allowing voice join
      const token = socket.handshake?.auth?.token;
      if (!token) return callback({ error: "Authentication required" });
      try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const db = getDb();
        const member = db
          .prepare("SELECT 1 FROM server_members WHERE user_id = ?")
          .get(payload.id);
        if (!member) return callback({ error: "Not a server member" });
        // Use the verified identity instead of trusting client-supplied values
        userId = payload.id;
        username = payload.username;
      } catch {
        return callback({ error: "Invalid or expired token" });
      }

      const room = await getOrCreateRoom(channelId);
      socket.join(`voice:${channelId}`);

      room.peers.set(socket.id, {
        userId,
        username,
        transports: new Map(), // transportId -> transport (has ._direction)
        producers: new Map(), // producerId  -> producer
        consumers: new Map(), // consumerId  -> consumer
        announced: false, // true once voice:newPeer has been emitted for this peer
      });

      // Only return peers that are already producing
      const peers = [];
      room.peers.forEach((peer, peerSocketId) => {
        if (peerSocketId !== socket.id && peer.announced) {
          peers.push({
            peerId: peerSocketId,
            userId: peer.userId,
            username: peer.username,
          });
        }
      });

      console.log(
        `[voice] JOIN     | channel=${channelId} | user=${username} | existingPeers=${peers.length}`,
      );

      callback({
        rtpCapabilities: room.router.rtpCapabilities,
        peers,
        iceServers: getIceServers(),
      });
    } catch (err) {
      console.error("voice:join error", err);
      callback({ error: err.message });
    }
  });

  // ── Create WebRTC transport ─────────────────────────────────────────────
  // direction is tagged on the transport object so we can find the recv
  // transport automatically during consume without the client sending it.
  socket.on(
    "voice:createTransport",
    async ({ channelId, direction }, callback) => {
      try {
        const room = voiceRooms.get(channelId);
        if (!room) return callback({ error: "Room not found" });

        const transport = await room.router.createWebRtcTransport({
          listenIps: [
            {
              ip: process.env.MEDIASOUP_LISTEN_IP || "0.0.0.0",
              announcedIp: process.env.PUBLIC_ADDRESS || "127.0.0.1",
            },
          ],
          enableUdp: true,
          enableTcp: true,
          preferUdp: true,
          initialAvailableOutgoingBitrate:
            parseInt(process.env.AUDIO_BITRATE_KBPS || "64", 10) * 1000,
        });

        transport._direction = direction; // tag for later lookup

        const peer = room.peers.get(socket.id);
        if (peer) peer.transports.set(transport.id, transport);

        transport.on("dtlsstatechange", (state) => {
          if (state === "failed" || state === "closed") {
            console.warn(
              `[voice] transport dtls=${state} | dir=${direction} | peer=${socket.id}`,
            );
            transport.close();
          }
        });

        callback({
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
        });
      } catch (err) {
        callback({ error: err.message });
      }
    },
  );

  // Connect transport (dtls handshake)
  socket.on(
    "voice:connectTransport",
    async ({ channelId, transportId, dtlsParameters }, callback) => {
      try {
        const room = voiceRooms.get(channelId);
        const peer = room?.peers.get(socket.id);
        const transport = peer?.transports.get(transportId);
        if (!transport) return callback({ error: "Transport not found" });
        await transport.connect({ dtlsParameters });
        callback({ ok: true });
      } catch (err) {
        callback({ error: err.message });
      }
    },
  );

  // ── Produce (client starts sending audio) ──────────────────────────────
  // On the first produce we announce the peer to everyone already in the room.
  socket.on(
    "voice:produce",
    async ({ channelId, transportId, kind, rtpParameters }, callback) => {
      try {
        const room = voiceRooms.get(channelId);
        const peer = room?.peers.get(socket.id);
        const transport = peer?.transports.get(transportId);
        if (!transport) return callback({ error: "Transport not found" });

        const producer = await transport.produce({ kind, rtpParameters });
        peer.producers.set(producer.id, producer);

        producer.on("transportclose", () => producer.close());

        // Announce to existing peers on first produce so they can consume this peer.
        if (!peer.announced) {
          peer.announced = true;
          console.log(
            `[voice] PRODUCE  | channel=${channelId} | user=${peer.username} | kind=${kind}`,
          );
          socket.to(`voice:${channelId}`).emit("voice:newPeer", {
            peerId: socket.id,
            userId: peer.userId,
            username: peer.username,
          });
        }

        callback({ id: producer.id });
      } catch (err) {
        callback({ error: err.message });
      }
    },
  );

  // ── Consume (client wants to hear a specific peer) ──────────────────────
  // Client sends { channelId, peerId, rtpCapabilities }.
  // Server finds the requesting client's recv transport and the target
  // peer's first audio producer automatically — no transportId/producerId needed.
  socket.on(
    "voice:consume",
    async ({ channelId, peerId, rtpCapabilities }, callback) => {
      try {
        const room = voiceRooms.get(channelId);
        const requestingPeer = room?.peers.get(socket.id);
        if (!requestingPeer)
          return callback({ error: "Requesting peer not found" });

        // Find this socket's recv transport
        let recvTransport = null;
        for (const [, t] of requestingPeer.transports) {
          if (t._direction === "recv") {
            recvTransport = t;
            break;
          }
        }
        if (!recvTransport)
          return callback({
            error: "Recv transport not found — call createTransport first",
          });

        // Find the target peer's first audio producer
        const targetPeer = room.peers.get(peerId);
        if (!targetPeer) return callback({ error: "Target peer not found" });

        let producerId = null;
        for (const [id, producer] of targetPeer.producers) {
          if (producer.kind === "audio") {
            producerId = id;
            break;
          }
        }
        if (!producerId)
          return callback({ error: "Target peer has no audio producer yet" });

        if (!room.router.canConsume({ producerId, rtpCapabilities }))
          return callback({ error: "Router cannot consume this producer" });

        // Create paused; client calls voice:resumeConsumer after transport is set up
        const consumer = await recvTransport.consume({
          producerId,
          rtpCapabilities,
          paused: true,
        });

        requestingPeer.consumers.set(consumer.id, consumer);
        consumer.on("transportclose", () => consumer.close());
        consumer.on("producerclose", () => {
          consumer.close();
          socket.emit("voice:consumerClosed", { consumerId: consumer.id });
        });

        console.log(
          `[voice] CONSUME  | channel=${channelId} | ${requestingPeer.username} ← ${targetPeer.username}`,
        );

        callback({
          id: consumer.id,
          producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
          // Pass paused state so client knows to call consumer.resume()
          paused: consumer.producerPaused,
        });
      } catch (err) {
        console.error("voice:consume error", err);
        callback({ error: err.message });
      }
    },
  );

  // ── Resume consumer ──────────────────────────────────────────────────────
  socket.on(
    "voice:resumeConsumer",
    async ({ channelId, consumerId }, callback) => {
      try {
        const room = voiceRooms.get(channelId);
        const peer = room?.peers.get(socket.id);
        const consumer = peer?.consumers.get(consumerId);
        if (!consumer) {
          console.warn(
            `[voice] resumeConsumer: consumer not found | id=${consumerId}`,
          );
          if (typeof callback === "function") callback();
          return;
        }
        await consumer.resume();
        if (typeof callback === "function") callback();
      } catch (err) {
        console.error("voice:resumeConsumer error", err.message);
        if (typeof callback === "function") callback();
      }
    },
  );

  // ── Speaking indicator (VAD telemetry) ───────────────────────────────────
  socket.on("voice:speaking", ({ channelId, speaking }) => {
    const room = voiceRooms.get(channelId);
    if (!room) return;
    // Broadcast to all other peers in the room so their speaking indicator lights up
    for (const [sid] of room.peers) {
      if (sid !== socket.id) {
        socket.to(sid).emit("voice:peerSpeaking", {
          peerId: socket.id,
          speaking,
        });
      }
    }
  });

  // ── Set outgoing bitrate cap ─────────────────────────────────────────────
  socket.on(
    "voice:setBitrate",
    async ({ channelId, transportId, maxBitrateKbps }) => {
      try {
        const room = voiceRooms.get(channelId);
        const peer = room?.peers.get(socket.id);
        const transport = peer?.transports.get(transportId);
        if (!transport) return;

        const bps = Math.max(8000, Math.min(512000, maxBitrateKbps * 1000));
        await transport.setMaxIncomingBitrate(bps);
        console.log(
          `[voice] BITRATE  | channel=${channelId} | user=${peer?.username} | ${bps / 1000} kbps`,
        );
      } catch (err) {
        console.error("voice:setBitrate error", err.message);
      }
    },
  );

  // ── Leave voice channel ──────────────────────────────────────────────────
  socket.on("voice:leave", (payload) => {
    const channelId = payload?.channelId;
    if (channelId) {
      cleanupPeer(socket.id, channelId, io);
    } else {
      voiceRooms.forEach((_room, id) => cleanupPeer(socket.id, id, io));
    }
  });

  socket.on("disconnect", () => {
    voiceRooms.forEach((_room, channelId) => {
      cleanupPeer(socket.id, channelId, io);
    });
  });
}

function cleanupPeer(socketId, channelId, io) {
  const room = voiceRooms.get(channelId);
  if (!room) return;
  const peer = room.peers.get(socketId);
  if (!peer) return;

  console.log(
    `[voice] LEFT     | channel=${channelId} | user=${peer.username}`,
  );

  peer.producers.forEach((p) => p.close());
  peer.consumers.forEach((c) => c.close());
  peer.transports.forEach((t) => t.close());
  room.peers.delete(socketId);

  io.to(`voice:${channelId}`).emit("voice:peerLeft", { peerId: socketId });

  if (room.peers.size === 0) {
    room.router.close();
    voiceRooms.delete(channelId);
    console.log(`[voice] ROOM_DEL | channel=${channelId} (empty)`);
  }
}

module.exports = { registerVoiceHandlers };
