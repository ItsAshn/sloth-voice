import { useState } from "react";
import { format } from "date-fns";
import { useStore } from "../../store/useStore";
import { deleteMessage } from "@sloth-voice/shared/api";
import type { Message } from "../../types";

interface Props {
  message: Message;
  currentUserId?: string;
}

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

function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm)$/i.test(url);
}

function isAudioUrl(url: string): boolean {
  return /\.(mp3|ogg|wav)$/i.test(url);
}

interface AttachmentPreviewProps {
  url: string;
  filename: string;
}

function AttachmentPreview({ url, filename }: AttachmentPreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  if (loadError) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block bg-surface-highest/50 rounded p-2 hover:bg-surface-highest transition-colors"
      >
        <span className="text-brand-primary text-xs">📎 {filename}</span>
      </a>
    );
  }

  if (isImageUrl(url)) {
    return (
      <div className="mt-1 max-w-sm">
        {expanded ? (
          <img
            src={url}
            alt={filename}
            className="rounded max-w-full cursor-pointer"
            onClick={() => setExpanded(false)}
            onError={() => setLoadError(true)}
          />
        ) : (
          <div
            className="relative cursor-pointer group"
            onClick={() => setExpanded(true)}
          >
            <img
              src={url}
              alt={filename}
              className="rounded max-w-full max-h-48 object-cover"
              onError={() => setLoadError(true)}
            />
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded">
              <span className="text-white text-xs">expand</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (isVideoUrl(url)) {
    return (
      <div className="mt-1 max-w-sm">
        <video
          src={url}
          controls
          className="rounded max-w-full max-h-48"
          onError={() => setLoadError(true)}
        />
      </div>
    );
  }

  if (isAudioUrl(url)) {
    return (
      <div className="mt-1 max-w-sm">
        <audio src={url} controls className="w-full max-w-xs" onError={() => setLoadError(true)} />
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 bg-surface-highest/50 hover:bg-surface-highest rounded px-2 py-1 transition-colors mt-1"
    >
      <span className="text-sm">📎</span>
      <span className="text-brand-primary text-xs hover:underline">{filename}</span>
    </a>
  );
}

function parseAttachments(content: string): { text: string; attachments: { url: string; filename: string }[] } {
  const attachments: { url: string; filename: string }[] = [];
  const markdownImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  let text = content;

  while ((match = markdownImageRegex.exec(content)) !== null) {
    const filename = match[1] || "file";
    const url = match[2];
    if (url.startsWith("/uploads/") || url.startsWith("http")) {
      attachments.push({ filename, url });
      text = text.replace(match[0], "");
    }
  }

  const urlRegex = /(https?:\/\/[^\s]+)/g;
  while ((match = urlRegex.exec(content)) !== null) {
    const url = match[1];
    if (
      isImageUrl(url) ||
      isVideoUrl(url) ||
      isAudioUrl(url) ||
      url.endsWith(".pdf")
    ) {
      if (!attachments.some((a) => a.url === url)) {
        attachments.push({ filename: url.split("/").pop() || "file", url });
      }
    }
  }

  return { text: text.trim(), attachments };
}

export default function MessageItem({ message, currentUserId }: Props) {
  const { activeServer, sessions, messages, setMessages } = useStore();
  const session = activeServer ? sessions[activeServer.id] : undefined;
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = async () => {
    if (!activeServer || !session) return;
    await deleteMessage(activeServer.url, session.token, message.id);
    setMessages(messages.filter((m) => m.id !== message.id));
  };

  const displayName = message.display_name || message.username || "Unknown";
  const isOwn = message.user_id === currentUserId;
  const { text, attachments } = parseAttachments(message.content);

  return (
    <div className={`group flex gap-3 px-2 py-1.5 rounded hover:bg-surface-highest/40 transition-colors ${
        isOwn ? "flex-row-reverse" : ""
      }`}
    >
      <div className="w-7 h-7 rounded bg-brand-primary/20 border border-brand-primary/30 flex items-center justify-center text-[11px] font-bold text-brand-primary shrink-0 mt-0.5 overflow-hidden relative">
        <span>{displayName.slice(0, 1).toUpperCase()}</span>
        {message.avatar && (
          <img
            src={message.avatar}
            alt="avatar"
            className="absolute inset-0 w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        )}
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
        {text && (
          <p
            className={`text-text-normal text-sm break-words max-w-prose rounded px-2 py-1 mt-0.5
          ${isOwn ? "bg-brand-primary/10 border border-brand-primary/20" : "bg-surface-highest/50"}`}
          >
            {renderContent(text, session?.user.username)}
          </p>
        )}
        {attachments.length > 0 && (
          <div className={`mt-1 flex flex-col gap-1 ${isOwn ? "items-end" : ""}`}>
            {attachments.map((att, i) => (
              <AttachmentPreview
                key={i}
                url={att.url}
                filename={att.filename}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}