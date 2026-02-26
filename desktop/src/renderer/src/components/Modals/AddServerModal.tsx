import { useState, useEffect } from "react";
import { fetchServerInfo } from "../../api/server";
import type { SavedServer } from "../../types";

interface Props {
  onClose: () => void;
  onAdded: (server: SavedServer) => void;
}

export default function AddServerModal({ onClose, onAdded }: Props) {
  const [url, setUrl] = useState("");
  const [step, setStep] = useState<"url" | "preview">("url");
  const [serverInfo, setServerInfo] = useState<{
    name: string;
    description: string;
    passwordProtected: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const info = await fetchServerInfo(url.trim());
      setServerInfo(info);
      setStep("preview");
    } catch {
      setError("Could not reach server. Check the URL and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!serverInfo) return;
    try {
      const newEntry: import("../../types").SavedServer = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: serverInfo.name,
        url: url.trim(),
        addedAt: Date.now(),
      };
      // IPC returns the full updated SavedServer[]
      const result = await window.slothVoice?.addServer(newEntry);
      const servers = (result ??
        []) as unknown as import("../../types").SavedServer[];
      const newServer =
        servers.find((s) => s.url === url.trim()) ??
        servers[servers.length - 1] ??
        newEntry;
      onAdded(newServer);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box max-w-md" onClick={(e) => e.stopPropagation()}>
        <p className="text-text-muted text-[10px] tracking-widest uppercase mb-1">
          // connect
        </p>
        <h2 className="modal-title">add a server</h2>

        {step === "url" ? (
          <form onSubmit={handleLookup} className="space-y-3">
            <div>
              <label className="label-xs">server url</label>
              <input
                className="input-field"
                placeholder="http://192.168.1.100:5000"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                autoFocus
                required
              />
            </div>
            {error && <p className="text-danger text-xs font-mono">{error}</p>}
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={onClose} className="btn-ghost">
                cancel
              </button>
              <button type="submit" disabled={loading} className="btn-primary">
                {loading ? "looking up…" : "next →"}
              </button>
            </div>
          </form>
        ) : (
          serverInfo && (
            <div className="space-y-4">
              <div className="bg-surface-highest border border-surface-highest rounded p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded bg-brand-primary/20 border border-brand-primary/30 flex items-center justify-center text-brand-primary font-bold text-sm shrink-0">
                  {serverInfo.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="text-text-normal text-sm font-semibold">
                    {serverInfo.name}
                  </p>
                  {serverInfo.description && (
                    <p className="text-text-muted text-xs">
                      {serverInfo.description}
                    </p>
                  )}
                  <p className="text-text-muted text-[10px] mt-1 font-mono">
                    {url}
                  </p>
                  {serverInfo.passwordProtected && (
                    <p className="text-yellow-400 text-[10px] mt-1 font-mono">
                      🔒 password protected — you'll need the server password to
                      register
                    </p>
                  )}
                </div>
              </div>
              {error && (
                <p className="text-danger text-xs font-mono">{error}</p>
              )}
              <div className="flex gap-2 justify-end">
                <button onClick={() => setStep("url")} className="btn-ghost">
                  ← back
                </button>
                <button onClick={handleAdd} className="btn-primary">
                  add server
                </button>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
