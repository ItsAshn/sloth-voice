import { useEffect, useRef } from "react";
import { useStore } from "../../store/useStore";
import { fetchMessages, configureApi } from "../../api/server";
import { useSocket } from "../../hooks/useSocket";
import MessageItem from "./MessageItem";
import MessageInput from "./MessageInput";

export default function ChatArea() {
  const { activeServer, activeChannel, sessions, messages, setMessages } =
    useStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const session = activeServer ? sessions[activeServer.id] : undefined;
  useSocket(activeServer?.url ?? "", session?.token);

  useEffect(() => {
    if (!activeServer || !activeChannel || !session) return;
    configureApi(activeServer.url, session.token);
    fetchMessages(activeChannel.id).then(setMessages).catch(console.error);
  }, [activeChannel, activeServer, session, setMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!activeChannel) return null;

  return (
    <div className="flex flex-col flex-1 bg-surface-high overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-11 border-b border-surface-mid shrink-0">
        <span className="text-brand-primary text-xs">&gt;</span>
        <span className="text-text-normal text-sm font-semibold tracking-wide">
          {activeChannel.name}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-0.5">
        {messages.length === 0 && (
          <p className="text-text-muted text-xs text-center mt-10 font-mono tracking-widest">
            no messages yet — say something
          </p>
        )}
        {messages.map((msg) => (
          <MessageItem
            key={msg.id}
            message={msg}
            currentUserId={session?.user.id}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {session && (
        <MessageInput
          channelId={activeChannel.id}
          channelName={activeChannel.name}
        />
      )}
    </div>
  );
}
