import { useRef, useCallback } from "react";
import { Device } from "mediasoup-client";
import { types as MsTypes } from "mediasoup-client";
import { Socket } from "socket.io-client";
import { useStore } from "../store/useStore";

/**
 * Threshold for local speaking detection using time-domain RMS.
 * Time-domain values for silence are ~128; any speech deviates from that.
 * A value of 8 corresponds to roughly 6% of full-scale amplitude — sensitive
 * enough to catch whispers but above mic self-noise on most hardware.
 */
const LOCAL_SPEAKING_THRESHOLD = 8;
/**
 * Threshold for remote speaking detection using frequency-domain average.
 * Remote WebRTC audio has consistent magnitude levels so frequency-domain
 * works well here.
 */
const REMOTE_SPEAKING_THRESHOLD = 15;
const SPEAKING_POLL_MS = 80;

function startSpeakingDetection(
  stream: MediaStream,
  onSpeaking: (speaking: boolean) => void,
): () => void {
  // Clone the stream so mediasoup's use of the original track cannot affect
  // our analyser node.
  const analyserStream = stream.clone();
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(analyserStream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.1;
  source.connect(analyser);
  // Time-domain buffer is fftSize (not frequencyBinCount)
  const buf = new Uint8Array(analyser.fftSize);
  let speaking = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const poll = () => {
    if (stopped) return;
    if (ctx.state === "suspended") {
      // Context got suspended — resume then retry
      ctx
        .resume()
        .then(() => {
          timer = setTimeout(poll, SPEAKING_POLL_MS);
        })
        .catch(() => {
          timer = setTimeout(poll, 200);
        });
      return;
    }
    // Use time-domain data for local mic: silence = all 128, speech deviates
    analyser.getByteTimeDomainData(buf);
    let squareSum = 0;
    for (let i = 0; i < buf.length; i++) {
      const deviation = buf[i] - 128;
      squareSum += deviation * deviation;
    }
    const rms = Math.sqrt(squareSum / buf.length);
    const nowSpeaking = rms > LOCAL_SPEAKING_THRESHOLD;
    if (nowSpeaking !== speaking) {
      speaking = nowSpeaking;
      onSpeaking(speaking);
    }
    timer = setTimeout(poll, SPEAKING_POLL_MS);
  };

  // Wait for the context to fully resume before starting the poll
  ctx.resume().then(poll).catch(poll);

  return () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    source.disconnect();
    ctx.close();
    // Stop cloned tracks so they don't linger
    analyserStream.getTracks().forEach((t) => t.stop());
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
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const poll = () => {
    if (stopped) return;
    if (ctx.state === "suspended") {
      ctx
        .resume()
        .then(() => {
          timer = setTimeout(poll, SPEAKING_POLL_MS);
        })
        .catch(() => {
          timer = setTimeout(poll, 200);
        });
      return;
    }
    analyser.getByteFrequencyData(buf);
    const rms = buf.reduce((a, b) => a + b, 0) / buf.length;
    const nowSpeaking = rms > REMOTE_SPEAKING_THRESHOLD;
    if (nowSpeaking !== speaking) {
      speaking = nowSpeaking;
      onSpeaking(speaking);
    }
    timer = setTimeout(poll, SPEAKING_POLL_MS);
  };

  ctx.resume().then(poll).catch(poll);

  return () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
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
    audioBitrateKbps,
    setAudioBitrateKbps,
    audioInputDeviceId,
    audioOutputDeviceId,
  } = useStore();

  const joinVoice = useCallback(
    async (socket: Socket, channelId: string) => {
      if (!socket) return;
      channelIdRef.current = channelId;

      // Resolve the local user's display name from the store
      const storeState = useStore.getState();
      const activeServer = storeState.activeServer;
      const session = activeServer
        ? storeState.sessions[activeServer.id]
        : null;
      const username = session?.user.display_name ?? "Unknown";
      const userId = session?.user.id ?? "";

      // 1. Join — server returns router RTP capabilities + already-producing peers
      const joinResult = await new Promise<{
        rtpCapabilities: MsTypes.RtpCapabilities;
        peers: { peerId: string; userId: string; username: string }[];
      }>((resolve) =>
        socket.emit("voice:join", { channelId, username, userId }, resolve),
      );

      if (!joinResult?.rtpCapabilities) {
        console.error("voice:join failed", joinResult);
        return;
      }

      // 2. Load mediasoup Device
      const device = new Device();
      await device.load({ routerRtpCapabilities: joinResult.rtpCapabilities });
      deviceRef.current = device;

      // 3. Create send transport
      const sendParams = await new Promise<MsTypes.TransportOptions>(
        (resolve) =>
          socket.emit(
            "voice:createTransport",
            { channelId, direction: "send" },
            resolve,
          ),
      );
      const sendTransport = device.createSendTransport(sendParams);
      sendTransportRef.current = sendTransport;

      sendTransport.on("connect", ({ dtlsParameters }, cb) => {
        socket.emit(
          "voice:connectTransport",
          { channelId, transportId: sendTransport.id, dtlsParameters },
          cb,
        );
      });
      sendTransport.on("produce", ({ kind, rtpParameters, appData }, cb) => {
        socket.emit(
          "voice:produce",
          {
            channelId,
            transportId: sendTransport.id,
            kind,
            rtpParameters,
            appData,
          },
          cb,
        );
      });

      // 4. Create recv transport
      const recvParams = await new Promise<MsTypes.TransportOptions>(
        (resolve) =>
          socket.emit(
            "voice:createTransport",
            { channelId, direction: "recv" },
            resolve,
          ),
      );
      const recvTransport = device.createRecvTransport(recvParams);
      recvTransportRef.current = recvTransport;

      recvTransport.on("connect", ({ dtlsParameters }, cb) => {
        socket.emit(
          "voice:connectTransport",
          { channelId, transportId: recvTransport.id, dtlsParameters },
          cb,
        );
      });

      // 5. Get mic and produce (this triggers voice:newPeer on the server side
      //    so existing peers learn about us only once we are actually sending)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: audioInputDeviceId
            ? { deviceId: { exact: audioInputDeviceId } }
            : true,
        });
        const track = stream.getAudioTracks()[0];
        const producer = await sendTransport.produce({
          track,
          encodings: [{ maxBitrate: audioBitrateKbps * 1000 }],
          codecOptions: { opusStereo: false, opusDtx: true },
        });
        producerRef.current = producer;

        // Start local speaking detection
        localSpeakingCleanupRef.current?.();
        localSpeakingCleanupRef.current = startSpeakingDetection(
          stream,
          (speaking) => {
            setLocalSpeaking(speaking);
            socket.emit("voice:speaking", { channelId, speaking });
          },
        );
      } catch (err) {
        console.error("Mic access denied", err);
      }

      // 6. Consume peers that were already producing when we joined
      for (const peer of joinResult.peers) {
        await consumePeer(
          socket,
          device,
          recvTransport,
          peer.peerId,
          channelId,
        );
        addVoicePeer({
          id: peer.peerId,
          userId: peer.userId,
          username: peer.username,
          speaking: false,
          muted: false,
        });
      }

      // 7. Listen for peers that start producing after we joined
      socket.on(
        "voice:newPeer",
        async (peer: { peerId: string; userId: string; username: string }) => {
          await consumePeer(
            socket,
            device,
            recvTransport,
            peer.peerId,
            channelId,
          );
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
    [
      addVoicePeer,
      removeVoicePeer,
      updateVoicePeer,
      setLocalSpeaking,
      audioBitrateKbps,
      audioInputDeviceId,
      audioOutputDeviceId,
    ],
  );

  const consumePeer = async (
    socket: Socket,
    device: MsTypes.Device,
    recvTransport: MsTypes.Transport,
    peerId: string,
    channelId: string,
  ) => {
    const params = await new Promise<MsTypes.ConsumerOptions>((resolve) =>
      socket.emit(
        "voice:consume",
        { channelId, peerId, rtpCapabilities: device.rtpCapabilities },
        resolve,
      ),
    );
    if (!params?.id) {
      console.warn("voice:consume returned no id for peer", peerId, params);
      return;
    }
    const consumer = await recvTransport.consume(params);
    consumersRef.current.set(peerId, consumer);
    const audioEl = new Audio();
    audioEl.srcObject = new MediaStream([consumer.track]);
    if (
      audioOutputDeviceId &&
      typeof (audioEl as any).setSinkId === "function"
    ) {
      (audioEl as any).setSinkId(audioOutputDeviceId).catch(console.error);
    }
    audioEl.play().catch(console.error);

    // Start remote speaking detection
    const cleanupRemote = startRemoteSpeakingDetection(
      consumer.track,
      (speaking) => updateVoicePeer(peerId, { speaking }),
    );
    remoteSpeakingCleanupsRef.current.set(peerId, cleanupRemote);

    await new Promise<void>((resolve) =>
      socket.emit(
        "voice:resumeConsumer",
        { channelId, consumerId: consumer.id },
        resolve,
      ),
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

  /**
   * Change the outgoing audio bitrate at runtime.
   * Updates the producer's RTP encoding limit on the client and notifies the
   * server to adjust its incoming bitrate cap on the matching transport.
   */
  const setAudioBitrate = useCallback(
    (socket: Socket, kbps: number) => {
      setAudioBitrateKbps(kbps);
      const bps = kbps * 1000;

      // Update the local producer encoding limit
      if (producerRef.current) {
        producerRef.current
          .setRtpEncodingParameters({ maxBitrate: bps })
          .catch(console.error);
      }

      // Ask the server to apply the cap on its side too
      if (socket && sendTransportRef.current) {
        socket.emit("voice:setBitrate", {
          channelId: channelIdRef.current,
          transportId: sendTransportRef.current.id,
          maxBitrateKbps: kbps,
        });
      }
    },
    [setAudioBitrateKbps],
  );

  return { joinVoice, leaveVoice, toggleMute, setAudioBitrate };
}
