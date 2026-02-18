import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useStore } from "../../store/useStore";
import { useVoice } from "../../hooks/useVoice";

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
    audioBitrateKbps,
    setAudioBitrateKbps,
  } = useStore();
  const session = activeServer ? sessions[activeServer.id] : undefined;
  const socketRef = useRef<Socket | null>(null);
  const { joinVoice, leaveVoice, toggleMute, setAudioBitrate } = useVoice();

  useEffect(() => {
    if (!activeServer || !activeVoiceChannel || !session) return;

    const socket = io(activeServer.url, {
      auth: { token: session.token },
      transports: ["websocket"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      joinVoice(socket, activeVoiceChannel.id);
    });

    return () => {
      leaveVoice(socket);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [activeServer?.url, activeVoiceChannel?.id, session?.token]);

  if (!activeVoiceChannel) return null;

  return (
    <div className="bg-surface-lowest shrink-0 border-b border-surface-mid">
      {/* Voice channel header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-success/10 border-b border-success/20">
        <span className="text-success text-[10px]">~</span>
        <span className="text-success text-[11px] font-semibold truncate flex-1">
          {activeVoiceChannel.name}
        </span>
        <span className="text-success text-[10px] font-mono">connected</span>
      </div>

      {/* Participants */}
      <div className="px-3 py-2 space-y-1">
        {/* Self */}
        {session && (
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
            <span className="text-[10px] font-mono text-text-muted">
              {localMuted ? "🔇" : ""}
            </span>
          </div>
        )}

        {/* Remote peers */}
        {voicePeers.map((peer) => {
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
              {peer.muted && (
                <span className="text-[10px] text-danger">🔇</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Controls */}
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

      {/* Bitrate selector */}
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
    </div>
  );
}
