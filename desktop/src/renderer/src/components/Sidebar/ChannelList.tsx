import { useEffect, useState } from "react";
import { useStore } from "../../store/useStore";
import { fetchChannels, createChannel, configureApi } from "../../api/server";
import AuthModal from "../Auth/AuthModal";
import ServerMenuModal from "../Modals/ServerMenuModal";
import { useStoreHydrated } from "../../hooks/useStoreHydrated";

export default function ChannelList() {
  const {
    activeServer,
    sessions,
    channels,
    setChannels,
    activeChannel,
    setActiveChannel,
    activeVoiceChannel,
    setActiveVoiceChannel,
    clearSession,
    setActiveDMChannel,
  } = useStore();
  const hydrated = useStoreHydrated();
  const [showAuth, setShowAuth] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelType, setNewChannelType] = useState<"text" | "voice">(
    "text",
  );
  const [creating, setCreating] = useState(false);

  const session = activeServer ? sessions[activeServer.id] : undefined;
  const isAdmin = session?.user?.role === "admin";

  useEffect(() => {
    if (!activeServer) return;
    if (!hydrated) return; // wait for localStorage sessions to load
    if (!session) {
      setShowAuth(true);
      return;
    }
    setShowAuth(false);
    configureApi(activeServer.url, session.token);
    fetchChannels()
      .then(setChannels)
      .catch((err) => {
        // Token expired or revoked — clear the session and re-authenticate
        if (err?.response?.status === 401) {
          clearSession(activeServer.id);
          setShowAuth(true);
        } else {
          console.error(err);
        }
      });
  }, [activeServer?.id, session?.token, hydrated, setChannels]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;
    setCreating(true);
    try {
      const ch = await createChannel(newChannelName.trim(), newChannelType);
      setChannels([...channels, ch]);
      setNewChannelName("");
    } finally {
      setCreating(false);
    }
  };

  const textChannels = channels.filter((c) => c.type === "text");
  const voiceChannels = channels.filter((c) => c.type === "voice");

  if (!activeServer) return null;

  return (
    <>
      <div className="flex flex-col flex-1 bg-surface-low border-r border-surface-mid overflow-hidden">
        {/* Server header */}
        <div className="flex items-center px-3 h-11 border-b border-surface-mid shrink-0">
          <span className="text-text-muted text-[10px] tracking-widest uppercase">
            //&nbsp;
          </span>
          <span className="text-text-normal text-xs font-semibold truncate tracking-wide flex-1">
            {activeServer.name}
          </span>
          <button
            onClick={() => setShowMenu(true)}
            title="server menu"
            className="text-text-muted hover:text-text-normal transition-colors p-1 rounded hover:bg-surface-highest shrink-0 font-mono text-sm leading-none"
          >
            ···
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          {/* Text channels */}
          <section>
            <p className="label-xs px-1 mb-1">» text</p>
            {textChannels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => {
                  setActiveChannel(ch);
                  setActiveDMChannel(null);
                }}
                className={`channel-item w-full ${activeChannel?.id === ch.id ? "active" : ""}`}
              >
                <span className="text-brand-primary text-[10px]">&gt;</span>
                <span className="truncate">{ch.name}</span>
              </button>
            ))}
            {textChannels.length === 0 && (
              <p className="text-text-muted text-[11px] px-2 py-1">
                no channels yet
              </p>
            )}
          </section>

          {/* Voice channels */}
          <section>
            <p className="label-xs px-1 mb-1">» voice</p>
            {voiceChannels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => {
                  setActiveVoiceChannel(
                    activeVoiceChannel?.id === ch.id ? null : ch,
                  );
                  setActiveDMChannel(null);
                }}
                className={`channel-item w-full ${activeVoiceChannel?.id === ch.id ? "active" : ""}`}
              >
                <span className="text-brand-primary text-[10px]">~</span>
                <span className="truncate">{ch.name}</span>
              </button>
            ))}
            {voiceChannels.length === 0 && (
              <p className="text-text-muted text-[11px] px-2 py-1">
                no channels yet
              </p>
            )}
          </section>

          {/* Create channel — admin only */}
          {session && isAdmin && (
            <form
              onSubmit={handleCreate}
              className="space-y-1.5 pt-3 border-t border-surface-highest"
            >
              <p className="label-xs px-1">+ new channel</p>
              <input
                className="input-field"
                placeholder="channel-name"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
              />
              <div className="flex gap-1.5">
                <div className="flex flex-1 bg-surface-lowest rounded border border-surface-highest overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setNewChannelType("text")}
                    className={`flex-1 py-1 text-[10px] font-mono transition-colors ${
                      newChannelType === "text"
                        ? "bg-brand-primary text-white"
                        : "text-text-muted hover:text-text-normal"
                    }`}
                  >
                    text
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewChannelType("voice")}
                    className={`flex-1 py-1 text-[10px] font-mono transition-colors ${
                      newChannelType === "voice"
                        ? "bg-brand-primary text-white"
                        : "text-text-muted hover:text-text-normal"
                    }`}
                  >
                    voice
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={creating}
                  className="btn-primary text-xs py-1 px-3"
                >
                  {creating ? "…" : "create"}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* User info footer */}
        {session && (
          <div className="flex items-center gap-2 px-3 py-2 border-t border-surface-mid bg-surface-lowest">
            <div className="w-6 h-6 rounded bg-brand-primary flex items-center justify-center text-[10px] font-bold text-white shrink-0 overflow-hidden relative">
              <span>{session.user.display_name.slice(0, 1).toUpperCase()}</span>
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
            <div className="flex-1 min-w-0">
              <p className="text-text-normal text-[11px] font-medium truncate">
                {session.user.display_name}
              </p>
              <p className="text-text-muted text-[10px] truncate">
                @{session.user.username}
                {isAdmin && (
                  <span className="ml-1 text-brand-primary font-semibold">
                    [admin]
                  </span>
                )}
              </p>
            </div>
          </div>
        )}
      </div>

      {showAuth && activeServer && (
        <AuthModal
          serverId={activeServer.id}
          serverUrl={activeServer.url}
          serverName={activeServer.name}
          onClose={() => setShowAuth(false)}
        />
      )}
      {showMenu && <ServerMenuModal onClose={() => setShowMenu(false)} />}
    </>
  );
}
