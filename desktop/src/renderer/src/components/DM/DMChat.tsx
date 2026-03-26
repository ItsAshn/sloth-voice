import { useEffect, useRef, useState, useCallback } from "react";
import { useStore } from "../../store/useStore";
import { fetchDMMessages, sendDMMessage, configureApi } from "../../api/server";
import { io, Socket } from "socket.io-client";

interface DMMessage {
  id: string;
  channel_id: string;
  from_id: string;
  from_username: string;
  display_name: string;
  content: string;
  created_at: number;
}

export default function DMChat() {
  const {
    activeServer,
    sessions,
    activeDMChannel,
    dmMessages,
    setDMMessages,
    addDMMessage,
  } = useStore();

  const session = activeServer ? sessions[activeServer.id] : undefined;
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!activeServer || !activeDMChannel || !session) return;

    configureApi(activeServer.url, session.token);
    setLoading(true);
    fetchDMMessages(activeDMChannel.id)
      .then((msgs) => {
        setDMMessages(
          msgs.map((m: any) => ({
            id: m.id,
            channel_id: m.channel_id,
            user_id: m.from_id,
            username: m.from_username,
            display_name: m.display_name,
            content: m.content,
            created_at: m.created_at,
          }))
        );
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    const socket = io(activeServer.url, {
      auth: { token: session.token },
      transports: ["websocket"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("dm:subscribe", { userId: session.user.id });
    });

    socket.on("dm:received", (msg: DMMessage) => {
      if (msg.channel_id === activeDMChannel.id) {
        addDMMessage({
          id: msg.id,
          channel_id: msg.channel_id,
          user_id: msg.from_id,
          username: msg.from_username,
          display_name: msg.display_name,
          content: msg.content,
          created_at: msg.created_at,
        });
      }
    });

    socket.on("dm:sent", (msg: DMMessage) => {
      if (msg.channel_id === activeDMChannel.id) {
        addDMMessage({
          id: msg.id,
          channel_id: msg.channel_id,
          user_id: msg.from_id,
          username: msg.from_username,
          display_name: msg.display_name,
          content: msg.content,
          created_at: msg.created_at,
        });
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [activeServer?.url, activeDMChannel?.id, session?.token]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
  }, []);

  useEffect(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [dmMessages]);

  const handleSend = async () => {
    const text = content.trim();
    if (!text || !activeServer || !session || !activeDMChannel) return;
    setSending(true);
    configureApi(activeServer.url, session.token);
    try {
      const msg = await sendDMMessage(activeDMChannel.id, text);
      addDMMessage({
        id: msg.id,
        channel_id: msg.channel_id,
        user_id: msg.from_id,
        username: msg.from_username,
        display_name: msg.display_name,
        content: msg.content,
        created_at: msg.created_at,
      });
      setContent("");
    } catch (err) {
      console.error("Failed to send DM:", err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const autoResize = useCallback(() => {
    const el = scrollContainerRef.current?.parentElement?.querySelector(
      "textarea"
    ) as HTMLTextAreaElement | null;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  if (!activeDMChannel) return null;

  return (
    <div className="flex flex-col flex-1 bg-surface-high overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-11 border-b border-surface-mid shrink-0">
        <span className="text-brand-primary text-xs">@</span>
        <span className="text-text-normal text-sm font-semibold tracking-wide">
          {activeDMChannel.other_display_name}
        </span>
        <span className="text-text-muted text-[10px]">
          @{activeDMChannel.other_username}
        </span>
      </div>

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-0.5"
      >
        {loading ? (
          <p className="text-text-muted text-xs text-center mt-10 font-mono tracking-widest animate-pulse">
            loading messages…
          </p>
        ) : dmMessages.length === 0 ? (
          <p className="text-text-muted text-xs text-center mt-10 font-mono tracking-widest">
            start a conversation
          </p>
        ) : null}
        {dmMessages.map((msg) => {
          const isOwn = msg.user_id === session?.user.id;
          return (
            <div
              key={msg.id}
              className={`group flex gap-3 px-2 py-1.5 rounded hover:bg-surface-highest/40 transition-colors ${
                isOwn ? "flex-row-reverse" : ""
              }`}
            >
              <div className="w-7 h-7 rounded bg-brand-primary/20 border border-brand-primary/30 flex items-center justify-center text-[11px] font-bold text-brand-primary shrink-0 mt-0.5">
                {(msg.display_name || msg.username || "?").slice(0, 1).toUpperCase()}
              </div>
              <div
                className={`flex flex-col flex-1 min-w-0 ${
                  isOwn ? "items-end" : ""
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-text-normal text-xs font-semibold tracking-wide">
                    {msg.display_name || msg.username || "Unknown"}
                  </span>
                  <span className="text-text-muted text-[10px] font-mono">
                    {new Date(msg.created_at).toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p
                  className={`text-text-normal text-sm break-words max-w-prose rounded px-2 py-1 mt-0.5 ${
                    isOwn
                      ? "bg-brand-primary/10 border border-brand-primary/20"
                      : "bg-surface-highest/50"
                  }`}
                >
                  {msg.content}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {session && (
        <div className="px-4 pb-4 pt-2 shrink-0">
          <div className="flex items-end gap-2 bg-surface-lowest border border-surface-highest focus-within:border-brand-primary rounded px-3 py-2 transition-colors">
            <span className="text-brand-primary text-xs mb-2 shrink-0">@</span>
            <textarea
              className="flex-1 bg-transparent text-text-normal text-sm outline-none resize-none placeholder:text-text-muted max-h-40 font-mono"
              rows={1}
              placeholder={`message ${activeDMChannel.other_display_name}`}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                requestAnimationFrame(autoResize);
              }}
              onKeyDown={handleKeyDown}
            />
            <button
              onClick={handleSend}
              disabled={sending || !content.trim()}
              className="btn-primary py-1 px-3 text-xs shrink-0 disabled:opacity-40"
            >
              {sending ? "..." : "send"}
            </button>
          </div>
          <p className="text-text-muted text-[10px] mt-1 px-1 font-mono">
            enter to send · shift+enter for new line
          </p>
        </div>
      )}
    </div>
  );
}