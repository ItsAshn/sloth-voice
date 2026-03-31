import { useEffect, useState } from "react";
import { useStore } from "../../store/useStore";
import {
  fetchMembers,
  fetchDMChannels,
  getOrCreateDMChannel,
} from "@sloth-voice/shared/api";

export default function MembersList() {
  const {
    activeServer,
    sessions,
    members,
    setMembers,
    dmChannels,
    setDMChannels,
    activeDMChannel,
    setActiveDMChannel,
    setActiveChannel,
  } = useStore();
  const session = activeServer ? sessions[activeServer.id] : undefined;
  const [showDMStart, setShowDMStart] = useState(false);
  const [startingDM, setStartingDM] = useState<string | null>(null);

  useEffect(() => {
    if (!activeServer || !session) return;
    fetchMembers(activeServer.url, session.token).then(setMembers).catch(console.error);
    fetchDMChannels(activeServer.url, session.token).then(setDMChannels).catch(console.error);
  }, [activeServer?.id, session?.token, setMembers, setDMChannels]);

  const handleStartDM = async (userId: string) => {
    if (!activeServer || !session || startingDM) return;
    setStartingDM(userId);
    try {
      const channel = await getOrCreateDMChannel(activeServer.url, session.token, userId);
      setDMChannels([
        channel,
        ...dmChannels.filter((c) => c.id !== channel.id),
      ]);
      setActiveDMChannel(channel);
      setActiveChannel(null);
      setShowDMStart(false);
    } catch (err) {
      console.error("Failed to start DM:", err);
    } finally {
      setStartingDM(null);
    }
  };

  const otherMembers = members.filter((m) => m.id !== session?.user.id);

  if (!activeServer || !session) return null;

  return (
    <div className="flex flex-col flex-1 bg-surface-low overflow-hidden">
      {/* Members section */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-3 h-9 flex items-center shrink-0">
          <span className="label-xs">members ({members.length})</span>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-surface-highest cursor-default transition-colors group"
            >
              <div className="w-5 h-5 rounded bg-brand-primary/20 border border-brand-primary/30 flex items-center justify-center text-[9px] font-bold text-brand-primary shrink-0 overflow-hidden relative">
                <span>
                  {(m.display_name || m.username).slice(0, 1).toUpperCase()}
                </span>
                {m.avatar && (
                  <img
                    src={m.avatar}
                    alt="avatar"
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display =
                        "none";
                    }}
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-text-normal text-[10px] font-medium truncate">
                  {m.display_name || m.username}
                  {m.role === "admin" && (
                    <span className="ml-1 text-brand-primary text-[8px] font-semibold">
                      ★
                    </span>
                  )}
                </p>
              </div>
              {m.id !== session.user.id && (
                <button
                  onClick={() => handleStartDM(m.id)}
                  disabled={startingDM !== null}
                  className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-brand-primary text-[10px] px-1 transition-opacity disabled:opacity-30"
                  title="send message"
                >
                  @
                </button>
              )}
            </div>
          ))}
          {members.length === 0 && (
            <p className="text-text-muted text-[10px] text-center mt-2 font-mono">
              no members
            </p>
          )}
        </div>
      </div>

      {/* DMs section at the bottom */}
      <div className="border-t border-surface-mid shrink-0">
        <div className="px-3 h-9 flex items-center justify-between">
          <span className="label-xs">direct messages</span>
          <button
            onClick={() => setShowDMStart(!showDMStart)}
            className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
              showDMStart
                ? "text-brand-primary bg-brand-primary/20"
                : "text-text-muted hover:text-text-normal hover:bg-surface-highest"
            }`}
            title="start new conversation"
          >
            +
          </button>
        </div>

        {/* Member list for starting new DMs */}
        {showDMStart && (
          <div className="max-h-32 overflow-y-auto px-2 py-1 border-b border-surface-highest bg-surface-lowest">
            {otherMembers.length === 0 ? (
              <p className="text-text-muted text-[9px] px-2 py-1">
                no other members
              </p>
            ) : (
              otherMembers.slice(0, 5).map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleStartDM(m.id)}
                  disabled={startingDM !== null}
                  className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-surface-highest transition-colors"
                >
                  <div className="w-4 h-4 rounded bg-brand-primary/20 flex items-center justify-center text-[8px] text-brand-primary shrink-0 overflow-hidden">
                    {m.avatar ? (
                      <img
                        src={m.avatar}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      (m.display_name || m.username).slice(0, 1).toUpperCase()
                    )}
                  </div>
                  <span className="text-text-normal text-[10px] truncate">
                    {m.display_name || m.username}
                  </span>
                  {startingDM === m.id && (
                    <span className="ml-auto text-[8px] text-text-muted">...</span>
                  )}
                </button>
              ))
            )}
          </div>
        )}

        {/* Recent DMs list */}
        <div className="max-h-28 overflow-y-auto px-2 py-1">
          {dmChannels.length === 0 && !showDMStart ? (
            <p className="text-text-muted text-[9px] text-center py-1 font-mono">
              click @ on a member to message
            </p>
          ) : (
            dmChannels.slice(0, 5).map((ch) => (
              <button
                key={ch.id}
                onClick={() => {
                  setActiveDMChannel(ch);
                  setActiveChannel(null);
                }}
                className={`w-full flex items-center gap-2 px-2 py-1 rounded transition-colors ${
                  activeDMChannel?.id === ch.id
                    ? "bg-brand-primary/20 text-brand-primary"
                    : "hover:bg-surface-highest text-text-normal"
                }`}
              >
                <div className="w-4 h-4 rounded bg-brand-primary/20 flex items-center justify-center text-[8px] text-brand-primary shrink-0 overflow-hidden">
                  {ch.other_avatar ? (
                    <img
                      src={ch.other_avatar}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    ch.other_display_name.slice(0, 1).toUpperCase()
                  )}
                </div>
                <span className="text-[10px] truncate">
                  {ch.other_display_name}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}