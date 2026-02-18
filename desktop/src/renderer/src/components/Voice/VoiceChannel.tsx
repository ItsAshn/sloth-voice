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
    localMuted,
    localSpeaking,
  } = useStore();
  const session = activeServer ? sessions[activeServer.id] : undefined;
  const socketRef = useRef<Socket | null>(null);
  const { joinVoice, leaveVoice, toggleMute } = useVoice();

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
    <div className="border-t border-surface-mid bg-surface-lowest shrink-0">
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
            <div
              className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center shrink-0
                ${
                  localMuted
                    ? "bg-danger/20 text-danger"
                    : localSpeaking
                      ? "bg-success/20 text-success"
                      : "bg-brand-primary/20 text-brand-primary"
                }`}
            >
              {session.user.display_name.slice(0, 1).toUpperCase()}
            </div>
            <span className="text-text-normal text-[11px] truncate flex-1">
              {session.user.display_name}
            </span>
            <span className="text-[10px] font-mono text-text-muted">
              {localMuted ? "🔇" : localSpeaking ? "🔊" : ""}
            </span>
          </div>
        )}

        {/* Remote peers */}
        {voicePeers.map((peer) => (
          <div key={peer.id} className="flex items-center gap-2">
            <div
              className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center shrink-0
                ${peer.speaking ? "bg-success/20 text-success" : "bg-surface-highest text-text-muted"}`}
            >
              {peer.username.slice(0, 1).toUpperCase()}
            </div>
            <span className="text-text-normal text-[11px] truncate flex-1">
              {peer.username}
            </span>
            {peer.muted && <span className="text-[10px] text-danger">🔇</span>}
          </div>
        ))}
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
    </div>
  );
}
