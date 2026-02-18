import { useState, useRef, useCallback } from "react";
import { useStore } from "../../store/useStore";
import { sendMessage, configureApi } from "../../api/server";

interface Props {
  channelId: string;
  channelName: string;
}

/** Extract the @-query currently being typed, e.g. "@foo" → "foo". Returns null if not in an @mention. */
function getAtQuery(text: string, cursor: number): string | null {
  const before = text.slice(0, cursor);
  const match = /(?:^|[\s])@([\w.\-]*)$/.exec(before);
  return match ? match[1] : null;
}

export default function MessageInput({ channelId, channelName }: Props) {
  const { activeServer, sessions, members, addMessage } = useStore();
  const session = activeServer ? sessions[activeServer.id] : undefined;
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [atQuery, setAtQuery] = useState<string | null>(null);
  const [atIndex, setAtIndex] = useState(0); // cursor index of the "@" token
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Always include @everyone / @here in the suggestions
  const specialTargets = ["everyone", "here"];
  const allSuggestions: string[] = [
    ...specialTargets,
    ...members.map((m) => m.username),
  ];
  const suggestions =
    atQuery !== null
      ? allSuggestions.filter((u) =>
          u.toLowerCase().startsWith(atQuery.toLowerCase()),
        )
      : [];

  const handleSend = async () => {
    const text = content.trim();
    if (!text || !activeServer || !session) return;
    setSending(true);
    setAtQuery(null);
    configureApi(activeServer.url, session.token);
    try {
      const msg = await sendMessage(channelId, text);
      addMessage({
        ...msg,
        display_name: session.user.display_name,
        username: session.user.username,
      });
      setContent("");
      inputRef.current?.focus();
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      suggestions.length > 0 &&
      (e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "Tab" ||
        e.key === "Escape")
    ) {
      e.preventDefault();
      if (e.key === "Escape") setAtQuery(null);
      if (
        (e.key === "Tab" || e.key === "ArrowDown") &&
        suggestions.length > 0
      ) {
        insertMention(suggestions[0]);
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setContent(val);
      const cursor = e.target.selectionStart ?? val.length;
      const query = getAtQuery(val, cursor);
      setAtQuery(query);
      if (query !== null) {
        // Record the position of the @ sign so we can replace the right token
        const before = val.slice(0, cursor);
        setAtIndex(before.lastIndexOf("@"));
      }
    },
    [],
  );

  const insertMention = (username: string) => {
    const before = content.slice(0, atIndex);
    const after = content.slice(atIndex + 1 + (atQuery?.length ?? 0));
    const newVal = `${before}@${username} ${after}`;
    setContent(newVal);
    setAtQuery(null);
    // Restore focus
    requestAnimationFrame(() => {
      if (inputRef.current) {
        const pos = before.length + username.length + 2; // @username + space
        inputRef.current.setSelectionRange(pos, pos);
        inputRef.current.focus();
      }
    });
  };

  return (
    <div className="px-4 pb-4 pt-2 shrink-0">
      {/* @-mention autocomplete popover */}
      {suggestions.length > 0 && (
        <div className="mb-1 bg-surface-low border border-surface-highest rounded overflow-hidden shadow-lg max-h-40 overflow-y-auto">
          {suggestions.slice(0, 8).map((u) => (
            <button
              key={u}
              onMouseDown={(e) => {
                e.preventDefault(); // don't blur textarea
                insertMention(u);
              }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text-normal hover:bg-brand-primary/20 transition-colors flex items-center gap-2"
            >
              <span className="text-brand-primary text-[10px]">@</span>
              {u}
              {(u === "everyone" || u === "here") && (
                <span className="ml-auto text-text-muted text-[9px]">
                  group
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 bg-surface-lowest border border-surface-highest focus-within:border-brand-primary rounded px-3 py-2 transition-colors">
        <span className="text-brand-primary text-xs mb-2 shrink-0">&gt;</span>
        <textarea
          ref={inputRef}
          className="flex-1 bg-transparent text-text-normal text-sm outline-none resize-none placeholder:text-text-muted max-h-40 font-mono"
          rows={1}
          placeholder={`message #${channelName}`}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
        <button
          onClick={handleSend}
          disabled={sending || !content.trim()}
          className="btn-primary py-1 px-3 text-xs shrink-0 disabled:opacity-40"
        >
          send
        </button>
      </div>
      <p className="text-text-muted text-[10px] mt-1 px-1 font-mono">
        enter to send · shift+enter for new line · @ to mention
      </p>
    </div>
  );
}
