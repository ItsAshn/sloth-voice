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
/** How long to hold the "speaking" state after silence before turning it off. */
const SPEAKING_HOLD_MS = 600;
const QUALITY_POLL_MS = 3000;

/** Derive a quality rating from an RTCStatsReport. */
function computeQualityFromStats(
  report: RTCStatsReport,
): "good" | "fair" | "poor" {
  let rttMs = 0;
  let jitterMs = 0;
  let lossRate = 0;
  report.forEach((stat: RTCStats & Record<string, unknown>) => {
    if (
      stat.type === "candidate-pair" &&
      (stat as any).state === "succeeded" &&
      (stat as any).currentRoundTripTime != null
    ) {
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
  let holdTimer: ReturnType<typeof setTimeout> | null = null;

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
    if (nowSpeaking) {
      // Cancel any pending hold-off — we're still speaking
      if (holdTimer !== null) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      if (!speaking) {
        speaking = true;
        onSpeaking(true);
      }
    } else if (speaking && holdTimer === null) {
      // Silence detected — hold the speaking state open briefly before clearing
      holdTimer = setTimeout(() => {
        holdTimer = null;
        speaking = false;
        onSpeaking(false);
      }, SPEAKING_HOLD_MS);
    }
    timer = setTimeout(poll, SPEAKING_POLL_MS);
  };

  // Wait for the context to fully resume before starting the poll
  ctx.resume().then(poll).catch(poll);

  return () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    if (holdTimer !== null) clearTimeout(holdTimer);
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

      // 5. Register peer event listeners BEFORE producing so we never miss
      //    a voice:newPeer event that arrives while we are in the mic/produce
      //    async chain below.
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

      // Server-authoritative speaking indicators
      socket.on(
        "voice:peerSpeaking",
        ({ peerId, speaking }: { peerId: string; speaking: boolean }) => {
          updateVoicePeer(peerId, { speaking });
        },
      );

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

      // 7. Get mic and produce — triggers voice:newPeer on other clients;
      //    listeners above are already registered so nothing is missed.
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

      // Start polling local connection quality — fire immediately then repeat
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
    },
    [
      addVoicePeer,
      removeVoicePeer,
      updateVoicePeer,
      setLocalSpeaking,
      setLocalConnectionQuality,
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

    // Resume server-side consumer so RTP starts flowing
    await new Promise<void>((resolve) =>
      socket.emit(
        "voice:resumeConsumer",
        { channelId, consumerId: consumer.id },
        resolve,
      ),
    );
    // Also resume the client-side consumer — mediasoup-client creates it
    // paused (mirroring the server's paused:true) so the track is silent
    // until this is called, regardless of what the server does.
    await consumer.resume();

    // Route audio through HTMLAudioElement (reliable hardware output in Electron).
    const audioEl = new Audio();
    audioEl.autoplay = true;
    audioEl.srcObject = new MediaStream([consumer.track]);
    if (audioOutputDeviceId) {
      try {
        await (
          audioEl as HTMLAudioElement & { setSinkId(id: string): Promise<void> }
        ).setSinkId(audioOutputDeviceId);
      } catch {
        /* setSinkId not supported or device unavailable — use default */
      }
    }
    await audioEl.play().catch(() => {
      /* autoplay policy — element will play when context allows */
    });
    audioElemsRef.current.set(peerId, audioEl);

    // Start remote speaking detection (shares the same track)
    const cleanupRemote = startRemoteSpeakingDetection(
      consumer.track,
      (speaking) => updateVoicePeer(peerId, { speaking }),
    );
    remoteSpeakingCleanupsRef.current.set(peerId, cleanupRemote);

    // Poll per-peer connection quality — fire immediately then repeat
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
      if (socket)
        socket.emit("voice:leave", { channelId: channelIdRef.current });
      channelIdRef.current = null;
    },
    [setVoicePeers, setLocalSpeaking, setLocalConnectionQuality],
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
