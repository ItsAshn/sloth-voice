import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useStore } from "../../store/useStore";
import { useVoice } from "../../hooks/useVoice";

type Quality = "good" | "fair" | "poor" | null | undefined;

function ConnectionQualityBars({ quality }: { quality: Quality }) {
  const barCount =
    quality === "good"? 3
      : quality === "fair"
        ? 2
        : quality === "poor"
          ? 1
          : 0;
  const color =
    quality === "good"
      ? "bg-success"
      : quality === "fair"
        ? "bg-yellow-400"
        : quality === "poor"
          ? "bg-danger"
          : "bg-surface-highest";
  const heights = ["h-[4px]", "h-[6px]", "h-[8px]"];
  return (
    <span
      className="flex items-end gap-[2px] shrink-0"
      title={quality ? `Connection: ${quality}` : "Measuring connection…"}
    >
      {heights.map((h, i) => (
        <span
          key={i}
          className={`w-[3px] rounded-sm ${h} ${i < barCount ? color : "bg-surface-highest"}`}
        />
      ))}
    </span>
  );
}

export default function VoiceChannel() {
  const {
    activeServer,
    activeVoiceChannel,
    setActiveVoiceChannel,
    sessions,
    voicePeers,
    members,
    localMuted,
    localSpeaking,
    localConnectionQuality,
    audioBitrateKbps,
    setAudioBitrateKbps,
    voiceError,
    setVoiceError,
  } = useStore();
  const session = activeServer ? sessions[activeServer.id] : undefined;
  const socketRef = useRef<Socket | null>(null);
  const { joinVoice, leaveVoice, toggleMute, setAudioBitrate } = useVoice();
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!activeServer || !activeVoiceChannel || !session) return;

    const socket = io(activeServer.url, {
      auth: { token: session.token },
      transports: ["websocket"],
    });
    socketRef.current = socket;

    socket.on("connect", async () => {
      setJoining(true);
      setVoiceError(null);
      const error = await joinVoice(socket, activeVoiceChannel.id);
      if (error) {
        console.error("Failed to join voice:", error);
      }
      setJoining(false);
    });

    socket.on("connect_error", (err) => {
      console.error("Socket connection error:", err);
      setVoiceError("Failed to connect to voice server. Please check your network connection.");
      setJoining(false);
    });

    return () => {
      leaveVoice(socket);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [activeServer?.url, activeVoiceChannel?.id, session?.token]);

  const handleRetry = () => {
    setVoiceError(null);
    if (socketRef.current && activeVoiceChannel) {
      joinVoice(socketRef.current, activeVoiceChannel.id);
    }
  };

  const handleLeave = () => {
    setVoiceError(null);
    setActiveVoiceChannel(null);
  };

  if (!activeVoiceChannel) return null;

  return (
    <div className="bg-surface-lowest shrink-0 border-b border-surface-mid">
      {voiceError && (
        <div className="bg-danger/10 border-b border-danger/30 px-3 py-2">
          <div className="text-danger text-[11px] font-medium mb-1.5">
            Voice Error
          </div>
          <p className="text-danger/90 text-[10px] mb-2">{voiceError}</p>
          <div className="flex gap-1.5">
            <button
              onClick={handleRetry}
              className="px-2 py-1 rounded text-[10px] font-mono bg-danger/20 text-danger hover:bg-danger/30 transition-colors"
            >
              retry
            </button>
            <button
              onClick={handleLeave}
              className="px-2 py-1 rounded text-[10px] font-mono bg-surface-high text-text-muted hover:bg-surface-highest transition-colors"
            >
              leave
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 px-3 py-1.5 bg-success/10 border-b border-success/20">
        <span className="text-success text-[10px]">~</span>
        <span className="text-success text-[11px] font-semibold truncate flex-1">
          {activeVoiceChannel.name}
        </span>
        <span className="text-success text-[10px] font-mono">
          {voiceError ? "error" : joining ? "connecting..." : "connected"}
        </span>
      </div>

      <div className="px-3 py-2 space-y-1">
        {session && (!voiceError || joining) && (
          <div className="flex items-center gap-2">
            <div className="relative shrink-0">
              {localSpeaking && !localMuted && (
                <span className="absolute inset-0 rounded animate-ping bg-success/40 pointer-events-none" />
              )}
              <div
                className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center relative overflow-hidden
                  ${
                    localMuted
                      ? "bg-danger/20 text-danger ring-1 ring-danger/40"
                      : localSpeaking
                        ? "bg-success/20 text-success ring-1 ring-success"
                        : "bg-brand-primary/20 text-brand-primary"
                  }`}
              >
                <span>
                  {session.user.display_name.slice(0, 1).toUpperCase()}
                </span>
                {session.user.avatar && (
                  <img
                    src={session.user.avatar}
                    alt="avatar"
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display =
                        "none";
                    }}
                  />
                )}
              </div>
            </div>
            <span
              className={`text-[11px] truncate flex-1 transition-colors ${
                localSpeaking && !localMuted
                  ? "text-success font-semibold"
                  : "text-text-normal"
              }`}
            >
              {session.user.display_name}
            </span>
            <ConnectionQualityBars quality={localConnectionQuality} />
            <span className="text-[10px] font-mono text-text-muted">
              {localMuted ? "🔇" : ""}
            </span>
          </div>
        )}

        {(!voiceError || joining) &&
          voicePeers.map((peer) => {
            const member = members.find((m) => m.id === peer.userId);
            return (
              <div key={peer.id} className="flex items-center gap-2">
                <div className="relative shrink-0">
                  {peer.speaking && !peer.muted && (
                    <span className="absolute inset-0 rounded animate-ping bg-success/40 pointer-events-none" />
                  )}
                  <div
                    className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center relative overflow-hidden
                  ${
                    peer.muted
                      ? "bg-surface-highest text-text-muted ring-1 ring-danger/40"
                      : peer.speaking
                        ? "bg-success/20 text-success ring-1 ring-success"
                        : "bg-surface-highest text-text-muted"
                  }`}
                  >
                    <span>{peer.username.slice(0, 1).toUpperCase()}</span>
                    {member?.avatar && (
                      <img
                        src={member.avatar}
                        alt="avatar"
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display =
                            "none";
                        }}
                      />
                    )}
                  </div>
                </div>
                <span
                  className={`text-[11px] truncate flex-1 transition-colors ${
                    peer.speaking && !peer.muted
                      ? "text-success font-semibold"
                      : "text-text-normal"
                  }`}
                >
                  {peer.username}
                </span>
                <ConnectionQualityBars quality={peer.connectionQuality} />
                {peer.muted && (
                  <span className="text-[10px] text-danger">🔇</span>
                )}
              </div>
            );
          })}
      </div>

      {(!voiceError || joining) && (
        <>
          <div className="flex items-center gap-1.5 px-3 pb-2">
            <button
              onClick={toggleMute}
              className={`flex-1 py-1 rounded text-[10px] font-mono transition-colors border
            ${
              localMuted
                ? "border-danger text-danger hover:bg-danger/10"
                : "border-surface-highest text-text-muted hover:border-brand-primary hover:text-brand-primary"
            }`}
            >
              {localMuted ? "unmute" : "mute"}
            </button>
            <button
              onClick={() => setActiveVoiceChannel(null)}
              className="flex-1 py-1 rounded text-[10px] font-mono border border-danger text-danger hover:bg-danger/10 transition-colors"
            >
              leave
            </button>
          </div>

          <div className="flex items-center gap-2 px-3 pb-2">
            <span className="text-text-muted text-[10px] font-mono shrink-0">
              bitrate
            </span>
            <select
              value={audioBitrateKbps}
              onChange={(e) => {
                const kbps = Number(e.target.value);
                setAudioBitrateKbps(kbps);
                if (socketRef.current) setAudioBitrate(socketRef.current, kbps);
              }}
              className="flex-1 bg-surface-high border border-surface-highest rounded text-[10px] font-mono text-text-normal px-1 py-0.5 focus:outline-none focus:border-brand-primary"
            >
              <option value={32}>32 kbps</option>
              <option value={64}>64 kbps</option>
              <option value={96}>96 kbps</option>
              <option value={128}>128 kbps</option>
              <option value={192}>192 kbps</option>
              <option value={256}>256 kbps</option>
              <option value={320}>320 kbps</option>
            </select>
          </div>
        </>
      )}
    </div>
  );
}