import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../../store/useStore";
import { fetchDMChannels } from "@sloth-voice/shared/api";
import ChatArea from "../Chat/ChatArea";

interface DMChannel {
  id: string;
  other_user_id: string;
  other_username: string;
  other_display_name: string;
  other_avatar: string | null;
  created_at: number;
  last_message_at: number | null;
}

interface ServerDMs {
  serverId: string;
  serverName: string;
  channels: DMChannel[];
}

export default function HomePage() {
  const { activeServer, activeChannel, savedServers, sessions, mentionCounts, setActiveServer } = useStore();
  const navigate = useNavigate();
  const [appVersion, setAppVersion] = useState<string>("...");
  const [serverDMs, setServerDMs] = useState<ServerDMs[]>([]);
  const [dmsLoading, setDmsLoading] = useState(false);

  useEffect(() => {
    window.slothVoice?.getVersion?.().then(setAppVersion).catch(() => setAppVersion("unknown"));
  }, []);

  const fetchAllDMs = useCallback(async (servers: typeof savedServers, sess: typeof sessions) => {
    if (servers.length === 0) {
      setServerDMs([]);
      return;
    }

    setDmsLoading(true);
    const results: ServerDMs[] = [];

    for (const server of servers) {
      const session = sess[server.id];
      if (!session?.token) continue;

      try {
        const channels = await fetchDMChannels(server.url, session.token);
        if (channels.length > 0) {
          results.push({
            serverId: server.id,
            serverName: server.name,
            channels: channels.slice(0, 3),
          });
        }
      } catch {
        // ignore errors for individual servers
      }
    }

    setServerDMs(results);
    setDmsLoading(false);
  }, []);

  useEffect(() => {
    fetchAllDMs(savedServers, sessions);
  }, [savedServers, sessions, fetchAllDMs]);

  if (activeServer && !activeChannel) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-text-muted bg-surface-high">
        <p className="font-mono text-sm">
          <span className="text-brand-primary">$</span>{" "}
          <span className="text-text-normal">channel select</span>
        </p>
        <p className="text-xs tracking-widest uppercase">
          choose a channel from the sidebar
        </p>
      </div>
    );
  }

  if (activeServer && activeChannel) {
    return <ChatArea />;
  }

  const connectedCount = savedServers.filter((s) => sessions[s.id]?.token).length;
  const totalMentions = Object.values(mentionCounts).reduce((sum, n) => sum + n, 0);

  const handleServerClick = (server: typeof savedServers[0]) => {
    const session = sessions[server.id];
    if (session?.token) {
      setActiveServer(server);
      navigate(`/server/${server.id}`);
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-text-muted bg-surface-high px-8 py-6 overflow-auto">
      <div className="w-full max-w-4xl grid grid-cols-2 gap-4">
        <div className="border border-surface-highest rounded overflow-hidden">
          <div className="bg-surface-highest px-3 py-1.5 border-b border-surface-highest flex items-center gap-2">
            <span className="text-brand-primary text-xs">[</span>
            <span className="text-text-normal text-xs font-semibold tracking-wide uppercase">
              servers
            </span>
            <span className="text-brand-primary text-xs ml-auto">{connectedCount}/{savedServers.length} connected]</span>
          </div>
          <div className="p-3 space-y-1 min-h-[140px]">
            {savedServers.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-text-muted text-xs italic mb-3">no servers configured</p>
                <p className="text-text-muted text-[10px]">
                  click <span className="text-brand-primary">+</span> in the sidebar to add one
                </p>
              </div>
            ) : (
              savedServers.map((server) => {
                const isConnected = !!sessions[server.id]?.token;
                const mentions = mentionCounts[server.id] ?? 0;
                return (
                  <button
                    key={server.id}
                    onClick={() => handleServerClick(server)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors ${
                      isConnected
                        ? "hover:bg-surface-highest cursor-pointer"
                        : "opacity-50 cursor-pointer hover:opacity-70"
                    }`}
                    title={isConnected ? `open ${server.name}` : "click to connect"}
                  >
                    <span className={`text-xs ${isConnected ? "text-success" : "text-warning"}`}>
                      {isConnected ? "●" : "○"}
                    </span>
                    {server.icon ? (
                      <img
                        src={server.icon}
                        alt={server.name}
                        className="w-5 h-5 rounded"
                      />
                    ) : (
                      <div className="w-5 h-5 rounded bg-surface-highest flex items-center justify-center text-brand-primary text-[10px] font-bold">
                        {server.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span className="flex-1 text-text-normal text-sm truncate">
                      {server.name}
                    </span>
                    {mentions > 0 && (
                      <span className="bg-danger text-white text-[10px] px-1.5 py-0.5 rounded-full">
                        {mentions > 99 ? "99+" : mentions}
                      </span>
                    )}
                    {!isConnected && (
                      <span className="text-[10px] text-warning">login</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="border border-surface-highest rounded overflow-hidden">
          <div className="bg-surface-highest px-3 py-1.5 border-b border-surface-highest flex items-center gap-2">
            <span className="text-brand-primary text-xs">[</span>
            <span className="text-text-normal text-xs font-semibold tracking-wide uppercase">
              direct messages
            </span>
            <span className="text-brand-primary text-xs ml-auto">]</span>
          </div>
          <div className="p-3 min-h-[140px]">
            {dmsLoading ? (
              <p className="text-text-muted text-xs italic">loading...</p>
            ) : serverDMs.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-text-muted text-xs italic mb-3">no recent conversations</p>
                <p className="text-text-muted text-[10px]">
                  DMs appear when you start a conversation
                </p>
              </div>
            ) : (
              serverDMs.map((sd) => (
                <div key={sd.serverId} className="mb-3 last:mb-0">
                  <p className="text-[10px] text-text-muted uppercase tracking-widest mb-1 px-2">
                    {sd.serverName}
                  </p>
                  {sd.channels.map((ch) => (
                    <button
                      key={ch.id}
                      onClick={() => {
                        const server = savedServers.find((s) => s.id === sd.serverId);
                        if (server && sessions[sd.serverId]?.token) {
                          setActiveServer(server);
                          navigate(`/server/${sd.serverId}`);
                          useStore.getState().setActiveDMChannel({
                            id: ch.id,
                            other_user_id: ch.other_user_id,
                            other_username: ch.other_username,
                            other_display_name: ch.other_display_name,
                            other_avatar: ch.other_avatar,
                            created_at: ch.created_at,
                            last_message_at: ch.last_message_at,
                          });
                        }
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-surface-highest transition-colors text-left"
                    >
                      <div className="w-6 h-6 rounded bg-surface-mid flex items-center justify-center text-brand-primary text-xs">
                        {ch.other_display_name?.[0]?.toUpperCase() || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-text-normal text-sm truncate">
                          {ch.other_display_name}
                        </p>
                        <p className="text-text-muted text-[10px]">
                          @{ch.other_username}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="border border-surface-highest rounded overflow-hidden">
          <div className="bg-surface-highest px-3 py-1.5 border-b border-surface-highest flex items-center gap-2">
            <span className="text-brand-primary text-xs">[</span>
            <span className="text-text-normal text-xs font-semibold tracking-wide uppercase">
              status
            </span>
            <span className="text-brand-primary text-xs ml-auto">]</span>
          </div>
          <div className="p-3 space-y-2 min-h-[80px]">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">servers</span>
              <span className="text-text-normal">{savedServers.length}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">connected</span>
              <span className={connectedCount === savedServers.length && savedServers.length > 0 ? "text-success" : "text-warning"}>
                {connectedCount}
              </span>
            </div>
            {totalMentions > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-muted">mentions</span>
                <span className="text-danger">{totalMentions}</span>
              </div>
            )}
          </div>
        </div>

        <div className="border border-surface-highest rounded overflow-hidden">
          <div className="bg-surface-highest px-3 py-1.5 border-b border-surface-highest flex items-center gap-2">
            <span className="text-brand-primary text-xs">[</span>
            <span className="text-text-normal text-xs font-semibold tracking-wide uppercase">
              about
            </span>
            <span className="text-brand-primary text-xs ml-auto">]</span>
          </div>
          <div className="p-3 space-y-2">
            <p className="text-text-normal text-sm font-semibold">
              sloth-voice <span className="text-brand-primary">v{appVersion}</span>
            </p>
            <p className="text-text-muted text-xs">
              self-hosted voice & chat
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="text-[10px] px-1.5 py-0.5 bg-surface-mid rounded text-text-muted">
                webrtc
              </span>
              <span className="text-[10px] px-1.5 py-0.5 bg-surface-mid rounded text-text-muted">
                mediasoup
              </span>
              <span className="text-[10px] px-1.5 py-0.5 bg-surface-mid rounded text-text-muted">
                electron
              </span>
              <span className="text-[10px] px-1.5 py-0.5 bg-surface-mid rounded text-text-muted">
                react
              </span>
              <span className="text-[10px] px-1.5 py-0.5 bg-surface-mid rounded text-text-muted">
                sqlite
              </span>
            </div>
          </div>
        </div>
      </div>

      <p className="text-text-muted text-xs tracking-widest uppercase">
        ← select a server to get started
      </p>
    </div>
  );
}