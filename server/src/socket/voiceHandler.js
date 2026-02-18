/**
 * Mediasoup SFU signaling via Socket.io
 * Each voice channel is a mediasoup Router.
 * Clients create Producers (send audio/video) and Consumers (receive).
 */

const { getWorker } = require("../mediasoup/worker");

// channelId -> { router, producers: Map, consumers: Map, peers: Map<socketId, {transports,producers,consumers}> }
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
    peers: new Map(), // socketId -> { transports, producers, consumers }
  };
  voiceRooms.set(channelId, room);
  return room;
}

function registerVoiceHandlers(io, socket) {
  // Join voice channel
  socket.on("voice:join", async ({ channelId, userId, username }, callback) => {
    try {
      const room = await getOrCreateRoom(channelId);
      socket.join(`voice:${channelId}`);

      room.peers.set(socket.id, {
        userId,
        username,
        transports: new Map(),
        producers: new Map(),
        consumers: new Map(),
      });

      // Tell existing peers that a new peer joined
      socket.to(`voice:${channelId}`).emit("voice:peer:joined", {
        socketId: socket.id,
        userId,
        username,
      });

      // Return RTP capabilities so client can create device
      callback({ rtpCapabilities: room.router.rtpCapabilities });
    } catch (err) {
      console.error("voice:join error", err);
      callback({ error: err.message });
    }
  });

  // Create WebRTC transport (one for send, one for receive)
  socket.on(
    "voice:createTransport",
    async ({ channelId, direction }, callback) => {
      try {
        const room = voiceRooms.get(channelId);
        if (!room) return callback({ error: "Room not found" });

        const transport = await room.router.createWebRtcTransport({
          listenIps: [
            {
              ip: process.env.MEDIASOUP_LISTEN_IP || "127.0.0.1",
              announcedIp: process.env.PUBLIC_ADDRESS || undefined,
            },
          ],
          enableUdp: true,
          enableTcp: true,
          preferUdp: true,
        });

        const peer = room.peers.get(socket.id);
        if (peer) peer.transports.set(transport.id, transport);

        transport.on("dtlsstatechange", (state) => {
          if (state === "closed") transport.close();
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

  // Produce (start sending audio/video)
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

        // Notify other peers
        socket.to(`voice:${channelId}`).emit("voice:newProducer", {
          producerId: producer.id,
          socketId: socket.id,
          kind,
        });

        callback({ id: producer.id });
      } catch (err) {
        callback({ error: err.message });
      }
    },
  );

  // Consume (start receiving audio/video from a producer)
  socket.on(
    "voice:consume",
    async (
      { channelId, transportId, producerId, rtpCapabilities },
      callback,
    ) => {
      try {
        const room = voiceRooms.get(channelId);
        const peer = room?.peers.get(socket.id);
        const transport = peer?.transports.get(transportId);
        if (!transport) return callback({ error: "Transport not found" });

        if (!room.router.canConsume({ producerId, rtpCapabilities }))
          return callback({ error: "Cannot consume" });

        const consumer = await transport.consume({
          producerId,
          rtpCapabilities,
          paused: false,
        });

        peer.consumers.set(consumer.id, consumer);
        consumer.on("transportclose", () => consumer.close());
        consumer.on("producerclose", () => {
          consumer.close();
          socket.emit("voice:consumerClosed", { consumerId: consumer.id });
        });

        callback({
          id: consumer.id,
          producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        });
      } catch (err) {
        callback({ error: err.message });
      }
    },
  );

  // Get existing producers in a room (so new joiners can subscribe)
  socket.on("voice:getProducers", ({ channelId }, callback) => {
    const room = voiceRooms.get(channelId);
    if (!room) return callback({ producers: [] });

    const producers = [];
    room.peers.forEach((peer, peerSocketId) => {
      if (peerSocketId !== socket.id) {
        peer.producers.forEach((producer) => {
          producers.push({
            producerId: producer.id,
            socketId: peerSocketId,
            kind: producer.kind,
          });
        });
      }
    });
    callback({ producers });
  });

  // Close producer (mute)
  socket.on("voice:closeProducer", ({ channelId, producerId }) => {
    const room = voiceRooms.get(channelId);
    const peer = room?.peers.get(socket.id);
    const producer = peer?.producers.get(producerId);
    if (producer) {
      producer.close();
      peer.producers.delete(producerId);
      socket
        .to(`voice:${channelId}`)
        .emit("voice:producerClosed", { producerId, socketId: socket.id });
    }
  });

  // Leave voice channel
  socket.on("voice:leave", (payload) => {
    const channelId = payload?.channelId;
    if (channelId) {
      cleanupPeer(socket.id, channelId, io);
    } else {
      // Fallback: clean up from all rooms this socket is in
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

  peer.producers.forEach((p) => p.close());
  peer.consumers.forEach((c) => c.close());
  peer.transports.forEach((t) => t.close());
  room.peers.delete(socketId);

  io.to(`voice:${channelId}`).emit("voice:peer:left", { socketId });

  if (room.peers.size === 0) {
    room.router.close();
    voiceRooms.delete(channelId);
  }
}

module.exports = { registerVoiceHandlers };
