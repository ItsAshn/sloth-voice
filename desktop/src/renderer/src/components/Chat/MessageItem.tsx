import { useState } from "react";
import { format } from "date-fns";
import { useStore } from "../../store/useStore";
import { deleteMessage, configureApi } from "../../api/server";
import type { Message } from "../../types";

interface Props {
  message: Message;
  currentUserId?: string;
}

/** Splits content into plain text and @mention tokens for styled rendering. */
function renderContent(content: string, currentUsername?: string) {
  const parts = content.split(/(@(?:everyone|here|[\w.\-]+))/g);
  return parts.map((part, i) => {
    if (part.startsWith("@")) {
      const tag = part.slice(1).toLowerCase();
      const isMe = currentUsername && tag === currentUsername.toLowerCase();
      const isGroup = tag === "everyone" || tag === "here";
      return (
        <span
          key={i}
          className={`inline-block rounded px-0.5 font-semibold
            ${isMe ? "bg-brand-primary/30 text-brand-primary" : ""}
            ${isGroup && !isMe ? "bg-yellow-500/20 text-yellow-400" : ""}
            ${!isMe && !isGroup ? "bg-surface-highest text-text-muted" : ""}`}
        >
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function MessageItem({ message, currentUserId }: Props) {
  const { activeServer, sessions, messages, setMessages } = useStore();
  const session = activeServer ? sessions[activeServer.id] : undefined;
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = async () => {
    if (!activeServer || !session) return;
    configureApi(activeServer.url, session.token);
    await deleteMessage(message.id);
    setMessages(messages.filter((m) => m.id !== message.id));
  };

  const displayName = message.display_name || message.username || "Unknown";
  const isOwn = message.user_id === currentUserId;

  return (
    <div
      className={`group flex gap-3 px-2 py-1.5 rounded hover:bg-surface-highest/40 transition-colors ${
        isOwn ? "flex-row-reverse" : ""
      }`}
    >
      <div className="w-7 h-7 rounded bg-brand-primary/20 border border-brand-primary/30 flex items-center justify-center text-[11px] font-bold text-brand-primary shrink-0 mt-0.5">
        {displayName.slice(0, 1).toUpperCase()}
      </div>
      <div
        className={`flex flex-col flex-1 min-w-0 ${isOwn ? "items-end" : ""}`}
      >
        <div className="flex items-baseline gap-2">
          <span className="text-text-normal text-xs font-semibold tracking-wide">
            {displayName}
          </span>
          <span className="text-text-muted text-[10px] font-mono">
            {format(new Date(message.created_at), "HH:mm")}
          </span>
          {isOwn && !confirmDelete && (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-danger text-xs px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-danger/10 transition-all"
            >
              del
            </button>
          )}
          {isOwn && confirmDelete && (
            <span className="flex items-center gap-1">
              <button
                onClick={handleDelete}
                className="text-danger text-xs px-1.5 py-0.5 rounded bg-danger/10 hover:bg-danger/20 transition-colors"
              >
                confirm
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-text-muted text-xs px-1 py-0.5 rounded hover:bg-surface-highest transition-colors"
              >
                cancel
              </button>
            </span>
          )}
        </div>
        <p
          className={`text-text-normal text-sm break-words max-w-prose rounded px-2 py-1 mt-0.5
          ${isOwn ? "bg-brand-primary/10 border border-brand-primary/20" : "bg-surface-highest/50"}`}
        >
          {renderContent(message.content, session?.user.username)}
        </p>
      </div>
    </div>
  );
}
