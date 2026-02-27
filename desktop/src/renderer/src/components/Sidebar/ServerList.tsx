import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../../store/useStore";
import type { SavedServer } from "../../types";
import AddServerModal from "../Modals/AddServerModal";
import ExportModal from "../Modals/ExportModal";
import SettingsModal from "../Modals/SettingsModal";

export default function ServerList() {
  const {
    savedServers,
    setSavedServers,
    activeServer,
    setActiveServer,
    mentionCounts,
    clearMentions,
  } = useStore();
  const navigate = useNavigate();
  const [showAdd, setShowAdd] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const handleSelect = (server: SavedServer) => {
    if (activeServer?.id !== server.id) {
      setActiveServer(server);
    }
    // Clear badge when user opens this server
    clearMentions(server.id);
    window.slothVoice?.clearMentions?.(server.id).catch(() => {});
    navigate(`/server/${server.id}`);
  };

  const handleAdd = async (server: SavedServer) => {
    // Optimistically add immediately so it shows in the rail right away
    setSavedServers([
      ...savedServers.filter((s) => s.id !== server.id),
      server,
    ]);
    setShowAdd(false);
    handleSelect(server);
    // Confirm with persisted list from electron-store (no-op in web mode)
    const updated = await window.slothVoice?.getServers();
    if (updated) setSavedServers(updated);
  };

  const handleRemove = async (id: string) => {
    // Optimistically remove immediately
    setSavedServers(savedServers.filter((s) => s.id !== id));
    if (activeServer?.id === id) {
      setActiveServer(null);
      navigate("/");
    }
    setConfirmRemove(null);
    await window.slothVoice?.removeServer(id);
  };

  return (
    <>
      <nav className="flex flex-col items-center gap-1 w-14 py-3 bg-surface-lowest overflow-y-auto shrink-0 border-r border-surface-mid">
        {/* Home button */}
        <button
          onClick={() => {
            setActiveServer(null);
            navigate("/");
          }}
          title="home"
          className="w-9 h-9 flex items-center justify-center text-brand-primary hover:text-white
                     border border-brand-primary hover:bg-brand-primary rounded transition-all text-xs font-mono font-semibold"
        >
          [D]
        </button>

        <div className="w-6 h-px bg-surface-highest my-2" />

        {/* Saved servers */}
        {savedServers.map((s) => {
          const badgeCount = mentionCounts[s.id] ?? 0;
          return (
            <div
              key={s.id}
              className="relative group w-full flex justify-center"
            >
              <button
                onClick={() => handleSelect(s)}
                title={s.name}
                className={`w-9 h-9 flex items-center justify-center text-xs font-semibold rounded transition-all font-mono
                  ${
                    activeServer?.id === s.id
                      ? "bg-brand-primary text-white"
                      : "border border-surface-highest text-text-muted hover:border-brand-primary hover:text-brand-primary"
                  }`}
              >
                {s.icon ? (
                  <img
                    src={s.icon}
                    alt={s.name}
                    className="w-full h-full object-cover rounded-[inherit]"
                  />
                ) : (
                  s.name.slice(0, 2).toUpperCase()
                )}
              </button>
              {/* Mention badge */}
              {badgeCount > 0 && (
                <span
                  className="pointer-events-none absolute -bottom-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5
                                 flex items-center justify-center rounded-full bg-danger text-white
                                 text-[9px] font-bold leading-none border border-surface-lowest z-10"
                >
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              )}
              {confirmRemove === s.id ? (
                <div className="absolute -top-1 -right-0.5 flex gap-0.5 z-20">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemove(s.id);
                    }}
                    title="confirm remove"
                    className="w-4 h-4 bg-danger rounded-sm flex items-center justify-center text-white text-[9px] leading-none"
                  >
                    ✓
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmRemove(null);
                    }}
                    title="cancel"
                    className="w-4 h-4 bg-surface-highest rounded-sm flex items-center justify-center text-text-muted text-[9px] leading-none"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmRemove(s.id);
                  }}
                  title="remove server"
                  className="absolute -top-1 -right-0.5 hidden group-hover:flex w-4 h-4 bg-danger
                             rounded-sm items-center justify-center text-white text-[9px] leading-none"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}

        <div className="w-6 h-px bg-surface-highest my-2" />

        {/* Add server */}
        <button
          onClick={() => setShowAdd(true)}
          title="add server"
          className="w-9 h-9 flex items-center justify-center border border-dashed border-surface-highest
                     text-text-muted hover:border-success hover:text-success rounded transition-all text-base font-mono"
        >
          +
        </button>

        {/* Export */}
        <button
          onClick={() => setShowExport(true)}
          title="export / import"
          className="w-9 h-9 flex items-center justify-center text-text-muted hover:text-text-normal
                     hover:bg-surface-highest rounded transition-all text-xs font-mono"
        >
          ⇅
        </button>

        {/* Spacer push settings to bottom */}
        <div className="flex-1" />

        {/* Settings */}
        <button
          onClick={() => setShowSettings(true)}
          title="settings"
          className="w-9 h-9 flex items-center justify-center text-text-muted hover:text-text-normal
                     hover:bg-surface-highest rounded transition-all"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </nav>

      {showAdd && (
        <AddServerModal onClose={() => setShowAdd(false)} onAdded={handleAdd} />
      )}
      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}
