import { useRef, useCallback } from "react";
import { Device } from "mediasoup-client";
import { types as MsTypes } from "mediasoup-client";
import { Socket } from "socket.io-client";
import { useStore } from "../store/useStore";

const LOCAL_SPEAKING_THRESHOLD = 8;
const REMOTE_SPEAKING_THRESHOLD = 15;
const SPEAKING_POLL_MS = 80;
const SPEAKING_HOLD_MS = 600;
const QUALITY_POLL_MS = 3000;
const RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_ATTEMPTS = 5;

function computeQualityFromStats(
  report: RTCStatsReport,
): "good" | "fair" | "poor" {
  let rttMs = 0;
  let jitterMs = 0;
  let lossRate = 0;
  report.forEach((stat: RTCStats & Record<string, unknown>) => {
    if (stat.type === "candidate-pair" &&(stat as any).state === "succeeded" &&(stat as any).currentRoundTripTime != null) {
      rttMs = ((stat as any).currentRoundTripTime as number) * 1000;
    }
    if (stat.type === "inbound-rtp" && (stat as any).kind === "audio") {
      jitterMs = ((stat as any).jitter ?? 0) * 1000;
      const received = (stat as any).packetsReceived ?? 0;
      const lost = (stat as any).packetsLost ?? 0;
      const total = received + lost;
      lossRate = total > 0 ? (lost / total) * 100 : 0;
    }
    if (stat.type === "remote-inbound-rtp" && (stat as any).kind === "audio") {
      if ((stat as any).roundTripTime != null)
        rttMs = ((stat as any).roundTripTime as number) * 1000;
      const lostFrac = (stat as any).fractionLost ?? 0;
      lossRate = Math.max(lossRate, lostFrac * 100);
    }
  });
  if (rttMs > 300 || jitterMs > 50 || lossRate > 8) return "poor";
  if (rttMs > 150 || jitterMs > 25 || lossRate > 3) return "fair";
  return "good";
}

function startSpeakingDetection(
  stream: MediaStream,
  onSpeaking: (speaking: boolean) => void,
): () => void {
  const analyserStream = stream.clone();
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(analyserStream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.1;
  source.connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);
  let speaking = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;

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
    analyser.getByteTimeDomainData(buf);
    let squareSum = 0;
    for (let i = 0; i < buf.length; i++) {
      const deviation = buf[i] - 128;
      squareSum += deviation * deviation;
    }
    const rms = Math.sqrt(squareSum / buf.length);
    const nowSpeaking = rms > LOCAL_SPEAKING_THRESHOLD;
    if (nowSpeaking) {
      if (holdTimer !== null) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      if (!speaking) {
        speaking = true;
        onSpeaking(true);
      }
    } else if (speaking && holdTimer === null) {
      holdTimer = setTimeout(() => {
        holdTimer = null;
        speaking = false;
        onSpeaking(false);
      }, SPEAKING_HOLD_MS);
    }
    timer = setTimeout(poll, SPEAKING_POLL_MS);
  };

  ctx.resume().then(poll).catch(poll);

  return () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    if (holdTimer !== null) clearTimeout(holdTimer);
    source.disconnect();
    ctx.close();
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
  let holdTimer: ReturnType<typeof setTimeout> | null = null;

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
    if (nowSpeaking) {
      if (holdTimer !== null) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      if (!speaking) {
        speaking = true;
        onSpeaking(true);
      }
    } else if (speaking && holdTimer === null) {
      holdTimer = setTimeout(() => {
        holdTimer = null;
        speaking = false;
        onSpeaking(false);
      }, SPEAKING_HOLD_MS);
    }
    timer = setTimeout(poll, SPEAKING_POLL_MS);
  };

  ctx.resume().then(poll).catch(poll);

  return () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    if (holdTimer !== null) clearTimeout(holdTimer);
    source.disconnect();
    ctx.close();
  };
}

export type VoiceError = {
  type: "permission_denied" | "device_not_found" | "device_in_use" | "transport_failed" | "unknown";
  message: string;
};

export function useVoice() {
  const deviceRef = useRef<MsTypes.Device | null>(null);
  const sendTransportRef = useRef<MsTypes.Transport | null>(null);
  const recvTransportRef = useRef<MsTypes.Transport | null>(null);
  const producerRef = useRef<MsTypes.Producer | null>(null);
  const consumersRef = useRef<Map<string, MsTypes.Consumer>>(new Map());
  const audioElemsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const channelIdRef = useRef<string | null>(null);
  const localSpeakingCleanupRef = useRef<(() => void) | null>(null);
  const remoteSpeakingCleanupsRef = useRef<Map<string, () => void>>(new Map());
  const qualityIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const peerQualityIntervalsRef = useRef<
    Map<string, ReturnType<typeof setInterval>>
  >(new Map());
  const reconnectAttemptsRef = useRef(0);
  const isReconnectingRef = useRef(false);
  const socketRef = useRef<Socket | null>(null);

  const {
    addVoicePeer,
    removeVoicePeer,
    setVoicePeers,
    updateVoicePeer,
    localMuted,
    setLocalMuted,
    setLocalSpeaking,
    setLocalConnectionQuality,
    audioBitrateKbps,
    setAudioBitrateKbps,
    audioInputDeviceId,
    audioOutputDeviceId,
    setVoiceError,
  } = useStore();

  const cleanupVoice = useCallback(() => {
    if (qualityIntervalRef.current != null) {
      clearInterval(qualityIntervalRef.current);
      qualityIntervalRef.current = null;
    }
    peerQualityIntervalsRef.current.forEach((interval) =>
      clearInterval(interval),
    );
    peerQualityIntervalsRef.current.clear();
    localSpeakingCleanupRef.current?.();
    localSpeakingCleanupRef.current = null;
    remoteSpeakingCleanupsRef.current.forEach((cleanup) => cleanup());
    remoteSpeakingCleanupsRef.current.clear();
    producerRef.current?.close();
    producerRef.current = null;
    consumersRef.current.forEach((c) => c.close());
    consumersRef.current.clear();
    audioElemsRef.current.forEach((el) => {
      el.pause();
      el.srcObject = null;
    });
    audioElemsRef.current.clear();
    sendTransportRef.current?.close();
    recvTransportRef.current?.close();
    sendTransportRef.current = null;
    recvTransportRef.current = null;
    deviceRef.current = null;
    setVoicePeers([]);
    setLocalSpeaking(false);
    setLocalConnectionQuality(null);
  }, [setVoicePeers, setLocalSpeaking, setLocalConnectionQuality]);

  const joinVoice = useCallback(
    async (socket: Socket, channelId: string): Promise<VoiceError | null> => {
      if (!socket) return { type: "unknown", message: "No socket connection" };
      channelIdRef.current = channelId;
      socketRef.current = socket;
      setVoiceError(null);

      const storeState = useStore.getState();
      const activeServer = storeState.activeServer;
      const session = activeServer
        ? storeState.sessions[activeServer.id]
        : null;
      const username = session?.user.display_name ?? "Unknown";
      const userId = session?.user.id ?? "";

      const joinResult = await new Promise<{
        rtpCapabilities: MsTypes.RtpCapabilities;
        peers: { peerId: string; userId: string; username: string }[];
        iceServers?: { urls: string; username?: string; credential?: string }[];
        error?: string;
      }>((resolve) =>
        socket.emit("voice:join", { channelId, username, userId }, resolve),
      );

      if (joinResult?.error) {
        console.error("voice:join failed", joinResult.error);
        return { type: "unknown", message: joinResult.error };
      }
      if (!joinResult?.rtpCapabilities) {
        console.error("voice:join failed", joinResult);
        return { type: "unknown", message: "Failed to join voice channel" };
      }

      const device = new Device();
      await device.load({ routerRtpCapabilities: joinResult.rtpCapabilities });
      deviceRef.current = device;

      const iceServers = joinResult.iceServers || [];

      const sendParams = await new Promise<MsTypes.TransportOptions>(
        (resolve) =>
          socket.emit(
            "voice:createTransport",
            { channelId, direction: "send" },
            resolve,
          ),
      );
      if ((sendParams as any).error) {
        return { type: "transport_failed", message: (sendParams as any).error };
      }
      const sendTransport = device.createSendTransport({
        ...sendParams,
        iceServers,
      });
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

      sendTransport.on("connectionstatechange", (state) => {
        if (state === "failed" || state === "closed") {
          console.error("Send transport connection state:", state);
          handleTransportFailure(socket, channelId);
        }
      });

      const recvParams = await new Promise<MsTypes.TransportOptions>(
        (resolve) =>
          socket.emit(
            "voice:createTransport",
            { channelId, direction: "recv" },
            resolve,
          ),
      );
      if ((recvParams as any).error) {
        return { type: "transport_failed", message: (recvParams as any).error };
      }
      const recvTransport = device.createRecvTransport({
        ...recvParams,
        iceServers,
      });
      recvTransportRef.current = recvTransport;

      recvTransport.on("connect", ({ dtlsParameters }, cb) => {
        socket.emit(
          "voice:connectTransport",
          { channelId, transportId: recvTransport.id, dtlsParameters },
          cb,
        );
      });

      recvTransport.on("connectionstatechange", (state) => {
        if (state === "failed" || state === "closed") {
          console.error("Recv transport connection state:", state);
          handleTransportFailure(socket, channelId);
        }
      });

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
        const leavingEl = audioElemsRef.current.get(peerId);
        if (leavingEl) {
          leavingEl.pause();
          leavingEl.srcObject = null;
        }
        audioElemsRef.current.delete(peerId);
        remoteSpeakingCleanupsRef.current.get(peerId)?.();
        remoteSpeakingCleanupsRef.current.delete(peerId);
        const peerQInt = peerQualityIntervalsRef.current.get(peerId);
        if (peerQInt != null) clearInterval(peerQInt);
        peerQualityIntervalsRef.current.delete(peerId);
        removeVoicePeer(peerId);
      });

      socket.on(
        "voice:peerSpeaking",
        ({ peerId, speaking }: { peerId: string; speaking: boolean }) => {
          updateVoicePeer(peerId, { speaking });
        },
      );

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

        localSpeakingCleanupRef.current?.();
        localSpeakingCleanupRef.current = startSpeakingDetection(
          stream,
          (speaking) => {
            setLocalSpeaking(speaking);
            socket.emit("voice:speaking", { channelId, speaking });
          },
        );
      } catch (err: any) {
        console.error("Microphone access error", err);
        let voiceError: VoiceError;
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          voiceError = {
            type: "permission_denied",
            message: "Microphone access was denied. Please allow microphone access in your browser settings and try again.",
          };
        } else if (err.name === "NotFoundError") {
          voiceError = {
            type: "device_not_found",
            message: "No microphone found. Please connect a microphone and try again.",
          };
        } else if (err.name === "NotReadableError" || err.name === "OverconstrainedError") {
          voiceError = {
            type: "device_in_use",
            message: "Microphone is being used by another application. Please close other apps using the microphone.",
          };
        } else {
          voiceError = {
            type: "unknown",
            message: `Failed to access microphone: ${err.message || "Unknown error"}`,
          };
        }
        setVoiceError(voiceError.message);
        cleanupVoice();
        socket.emit("voice:leave", { channelId });
        channelIdRef.current = null;
        socketRef.current = null;
        return voiceError;
      }

      if (qualityIntervalRef.current != null)
        clearInterval(qualityIntervalRef.current);
      const pollLocalQuality = async () => {
        if (!sendTransportRef.current) return;
        try {
          const stats = await sendTransportRef.current.getStats();
          setLocalConnectionQuality(computeQualityFromStats(stats));
        } catch {
          // ignore transient errors
        }
      };
      pollLocalQuality();
      qualityIntervalRef.current = setInterval(
        pollLocalQuality,
        QUALITY_POLL_MS,
      );

      reconnectAttemptsRef.current = 0;
      return null;
    },
    [
      addVoicePeer,
      removeVoicePeer,
      updateVoicePeer,
      setLocalSpeaking,
      setLocalConnectionQuality,
      setVoiceError,
      cleanupVoice,
      audioBitrateKbps,
      audioInputDeviceId,
      audioOutputDeviceId,
    ],
  );

  const handleTransportFailure = useCallback(
    (socket: Socket, channelId: string) => {
      if (isReconnectingRef.current) return;
      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        console.error("Max reconnect attempts reached");
        setVoiceError("Connection lost. Please rejoin the voice channel.");
        cleanupVoice();
        return;
      }
      isReconnectingRef.current = true;
      reconnectAttemptsRef.current++;
      console.log(
        `Attempting voice reconnect (${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})...`,
      );
      setTimeout(async () => {
        if (!socket.connected) {
          isReconnectingRef.current = false;
          return;
        }
        cleanupVoice();
        try {
          const error = await joinVoice(socket, channelId);
          if (error) {
            console.error("Reconnect failed:", error);
            setVoiceError(error.message);
          }
        } catch (err) {
          console.error("Reconnect error:", err);
          setVoiceError("Failed to reconnect to voice channel.");
        }
        isReconnectingRef.current = false;
      }, RECONNECT_DELAY_MS * reconnectAttemptsRef.current);
    },
    [joinVoice, cleanupVoice, setVoiceError],
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

    await new Promise<void>((resolve) =>
      socket.emit(
        "voice:resumeConsumer",
        { channelId, consumerId: consumer.id },
        resolve,
      ),
    );
    await consumer.resume();

    const audioEl = new Audio();
    audioEl.autoplay = true;
    audioEl.srcObject = new MediaStream([consumer.track]);
    const storeState = useStore.getState();
    const outputDeviceId = storeState.audioOutputDeviceId;
    if (outputDeviceId) {
      try {
        await (
          audioEl as HTMLAudioElement & { setSinkId(id: string): Promise<void> }
        ).setSinkId(outputDeviceId);
      } catch {
        /* setSinkId not supported or device unavailable — use default */
      }
    }
    await audioEl.play().catch(() => {
      /* autoplay policy — element will play when context allows */
    });
    audioElemsRef.current.set(peerId, audioEl);

    const cleanupRemote = startRemoteSpeakingDetection(
      consumer.track,
      (speaking) => updateVoicePeer(peerId, { speaking }),
    );
    remoteSpeakingCleanupsRef.current.set(peerId, cleanupRemote);

    const pollPeerQuality = async () => {
      const c = consumersRef.current.get(peerId);
      if (!c) return;
      try {
        const stats = await c.getStats();
        updateVoicePeer(peerId, {
          connectionQuality: computeQualityFromStats(stats),
        });
      } catch {
        // ignore
      }
    };
    pollPeerQuality();
    const peerQInt = setInterval(pollPeerQuality, QUALITY_POLL_MS);
    peerQualityIntervalsRef.current.set(peerId, peerQInt);
  };

  const leaveVoice = useCallback(
    (socket?: Socket) => {
      cleanupVoice();
      if (socket)
        socket.emit("voice:leave", { channelId: channelIdRef.current });
      channelIdRef.current = null;
      socketRef.current = null;
      setVoiceError(null);
    },
    [cleanupVoice, setVoiceError],
  );

  const toggleMute = useCallback(() => {
    const muted = !localMuted;
    setLocalMuted(muted);
    if (producerRef.current) {
      if (muted) producerRef.current.pause();
      else producerRef.current.resume();
    }
  }, [localMuted, setLocalMuted]);

  const setAudioBitrate = useCallback(
    (socket: Socket, kbps: number) => {
      setAudioBitrateKbps(kbps);
      const bps = kbps * 1000;

      if (producerRef.current) {
        producerRef.current
          .setRtpEncodingParameters({ maxBitrate: bps })
          .catch(console.error);
      }

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