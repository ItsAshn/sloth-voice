import { useRef, useCallback } from "react";
import { Device } from "mediasoup-client";
import { types as MsTypes } from "mediasoup-client";
import { Socket } from "socket.io-client";
import { useStore } from "../store/useStore";

const SPEAKING_THRESHOLD = 15; // RMS threshold 0-255
const SPEAKING_POLL_MS = 80;

function startSpeakingDetection(
  stream: MediaStream,
  onSpeaking: (speaking: boolean) => void,
): () => void {
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.3;
  source.connect(analyser);
  const buf = new Uint8Array(analyser.frequencyBinCount);
  let speaking = false;
  const interval = setInterval(() => {
    analyser.getByteFrequencyData(buf);
    const rms = buf.reduce((a, b) => a + b, 0) / buf.length;
    const nowSpeaking = rms > SPEAKING_THRESHOLD;
    if (nowSpeaking !== speaking) {
      speaking = nowSpeaking;
      onSpeaking(speaking);
    }
  }, SPEAKING_POLL_MS);
  return () => {
    clearInterval(interval);
    source.disconnect();
    ctx.close();
  };
}

function startRemoteSpeakingDetection(
  track: MediaStreamTrack,
  onSpeaking: (speaking: boolean) => void,
): () => void {
  const ctx = new AudioContext();
  const stream = new MediaStream([track]);
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.3;
  source.connect(analyser);
  const buf = new Uint8Array(analyser.frequencyBinCount);
  let speaking = false;
  const interval = setInterval(() => {
    analyser.getByteFrequencyData(buf);
    const rms = buf.reduce((a, b) => a + b, 0) / buf.length;
    const nowSpeaking = rms > SPEAKING_THRESHOLD;
    if (nowSpeaking !== speaking) {
      speaking = nowSpeaking;
      onSpeaking(speaking);
    }
  }, SPEAKING_POLL_MS);
  return () => {
    clearInterval(interval);
    source.disconnect();
    ctx.close();
  };
}

export function useVoice() {
  const deviceRef = useRef<MsTypes.Device | null>(null);
  const sendTransportRef = useRef<MsTypes.Transport | null>(null);
  const recvTransportRef = useRef<MsTypes.Transport | null>(null);
  const producerRef = useRef<MsTypes.Producer | null>(null);
  const consumersRef = useRef<Map<string, MsTypes.Consumer>>(new Map());
  const channelIdRef = useRef<string | null>(null);
  const localSpeakingCleanupRef = useRef<(() => void) | null>(null);
  const remoteSpeakingCleanupsRef = useRef<Map<string, () => void>>(new Map());

  const {
    addVoicePeer,
    removeVoicePeer,
    setVoicePeers,
    updateVoicePeer,
    localMuted,
    setLocalMuted,
    setLocalSpeaking,
  } = useStore();

  const joinVoice = useCallback(
    async (socket: Socket, channelId: string) => {
      if (!socket) return;
      channelIdRef.current = channelId;

      // Load mediasoup device
      const routerRtpCapabilities = await new Promise<MsTypes.RtpCapabilities>(
        (resolve) => socket.emit("voice:getRouterCapabilities", resolve),
      );

      const device = new Device();
      await device.load({ routerRtpCapabilities });
      deviceRef.current = device;

      // Create send transport
      const sendParams = await new Promise<MsTypes.TransportOptions>(
        (resolve) =>
          socket.emit("voice:createTransport", { direction: "send" }, resolve),
      );
      const sendTransport = device.createSendTransport(sendParams);
      sendTransportRef.current = sendTransport;

      sendTransport.on("connect", ({ dtlsParameters }, cb) => {
        socket.emit(
          "voice:connectTransport",
          { transportId: sendTransport.id, dtlsParameters },
          cb,
        );
      });
      sendTransport.on("produce", ({ kind, rtpParameters, appData }, cb) => {
        socket.emit(
          "voice:produce",
          { transportId: sendTransport.id, kind, rtpParameters, appData },
          cb,
        );
      });

      // Create recv transport
      const recvParams = await new Promise<MsTypes.TransportOptions>(
        (resolve) =>
          socket.emit("voice:createTransport", { direction: "recv" }, resolve),
      );
      const recvTransport = device.createRecvTransport(recvParams);
      recvTransportRef.current = recvTransport;

      recvTransport.on("connect", ({ dtlsParameters }, cb) => {
        socket.emit(
          "voice:connectTransport",
          { transportId: recvTransport.id, dtlsParameters },
          cb,
        );
      });

      // Get mic stream and produce
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const track = stream.getAudioTracks()[0];
        const producer = await sendTransport.produce({ track });
        producerRef.current = producer;

        // Start local speaking detection
        localSpeakingCleanupRef.current?.();
        localSpeakingCleanupRef.current = startSpeakingDetection(
          stream,
          setLocalSpeaking,
        );
      } catch (err) {
        console.error("Mic access denied", err);
      }

      // Join channel and consume existing peers
      const peers = await new Promise<
        { peerId: string; userId: string; username: string }[]
      >((resolve) => socket.emit("voice:join", { channelId }, resolve));

      for (const peer of peers) {
        await consumePeer(socket, device, recvTransport, peer.peerId);
        addVoicePeer({
          id: peer.peerId,
          userId: peer.userId,
          username: peer.username,
          speaking: false,
          muted: false,
        });
      }

      // Listen for new peers
      socket.on(
        "voice:newPeer",
        async (peer: { peerId: string; userId: string; username: string }) => {
          await consumePeer(socket, device, recvTransport, peer.peerId);
          addVoicePeer({
            id: peer.peerId,
            userId: peer.userId,
            username: peer.username,
            speaking: false,
            muted: false,
          });
        },
      );

      socket.on("voice:peerLeft", ({ peerId }: { peerId: string }) => {
        consumersRef.current.get(peerId)?.close();
        consumersRef.current.delete(peerId);
        remoteSpeakingCleanupsRef.current.get(peerId)?.();
        remoteSpeakingCleanupsRef.current.delete(peerId);
        removeVoicePeer(peerId);
      });
    },
    [addVoicePeer, removeVoicePeer, updateVoicePeer, setLocalSpeaking],
  );

  const consumePeer = async (
    socket: Socket,
    device: MsTypes.Device,
    recvTransport: MsTypes.Transport,
    peerId: string,
  ) => {
    const params = await new Promise<MsTypes.ConsumerOptions>((resolve) =>
      socket.emit(
        "voice:consume",
        { peerId, rtpCapabilities: device.rtpCapabilities },
        resolve,
      ),
    );
    if (!params.id) return;
    const consumer = await recvTransport.consume(params);
    consumersRef.current.set(peerId, consumer);
    const audioEl = new Audio();
    audioEl.srcObject = new MediaStream([consumer.track]);
    audioEl.play().catch(console.error);

    // Start remote speaking detection
    const cleanupRemote = startRemoteSpeakingDetection(
      consumer.track,
      (speaking) => updateVoicePeer(peerId, { speaking }),
    );
    remoteSpeakingCleanupsRef.current.set(peerId, cleanupRemote);

    await new Promise<void>((resolve) =>
      socket.emit("voice:resumeConsumer", { consumerId: consumer.id }, resolve),
    );
  };

  const leaveVoice = useCallback(
    (socket?: Socket) => {
      localSpeakingCleanupRef.current?.();
      localSpeakingCleanupRef.current = null;
      remoteSpeakingCleanupsRef.current.forEach((cleanup) => cleanup());
      remoteSpeakingCleanupsRef.current.clear();
      producerRef.current?.close();
      producerRef.current = null;
      consumersRef.current.forEach((c) => c.close());
      consumersRef.current.clear();
      sendTransportRef.current?.close();
      recvTransportRef.current?.close();
      sendTransportRef.current = null;
      recvTransportRef.current = null;
      deviceRef.current = null;
      setVoicePeers([]);
      setLocalSpeaking(false);
      if (socket)
        socket.emit("voice:leave", { channelId: channelIdRef.current });
      channelIdRef.current = null;
    },
    [setVoicePeers, setLocalSpeaking],
  );

  const toggleMute = useCallback(() => {
    const muted = !localMuted;
    setLocalMuted(muted);
    if (producerRef.current) {
      if (muted) producerRef.current.pause();
      else producerRef.current.resume();
    }
  }, [localMuted, setLocalMuted]);

  return { joinVoice, leaveVoice, toggleMute };
}
