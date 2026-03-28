import { useState, useEffect } from "react";
import { fetchServerInfo, resolveInviteCode } from "@sloth-voice/shared/api";
import type { SavedServer } from "../../types";

interface Props {
  onClose: () => void;
  onAdded: (server: SavedServer) => void;
  initialUrl?: string;
  initialInviteCode?: string;
}

function isInviteCode(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  const parts = trimmed.split(".");
  if (parts.length !== 2) return false;
  const [encoded, token] = parts;
  const base64urlPattern = /^[A-Za-z0-9_-]+$/;
  return base64urlPattern.test(encoded) && base64urlPattern.test(token);
}

export default function AddServerModal({
  onClose,
  onAdded,
  initialUrl = "",
  initialInviteCode = "",
}: Props) {
  const [input, setInput] = useState(initialUrl || initialInviteCode);
  const [step, setStep] = useState<"input" | "preview">("input");
  const [serverInfo, setServerInfo] = useState<{
    name: string;
    description: string;
    passwordProtected: boolean;
  } | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    if (initialUrl || initialInviteCode) {
      handleLookup(new Event("submit") as any);
    }
  }, []);

  const normalizeUrl = (input: string): string => {
    const trimmed = input.trim();
    if (!trimmed) return trimmed;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `http://${trimmed}`;
  };

  const handleLookup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const trimmed = input.trim();
      if (isInviteCode(trimmed)) {
        const resolved = await resolveInviteCode(trimmed);
        setResolvedUrl(resolved.serverUrl);
        setServerInfo({
          name: resolved.name,
          description: resolved.description,
          passwordProtected: false,
        });
      } else {
        const normalizedUrl = normalizeUrl(trimmed);
        setInput(normalizedUrl);
        const info = await fetchServerInfo(normalizedUrl);
        setServerInfo(info);
      }
      setStep("preview");
    } catch {
      setError(
        isInviteCode(trimmed)
          ? "Invalid or expired invite code."
          : "Could not reach server. Check the URL or code and try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!serverInfo) return;
    const serverUrl = resolvedUrl || normalizeUrl(input);
    try {
      const newEntry: import("../../types").SavedServer = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: serverInfo.name,
        url: serverUrl,
        addedAt: Date.now(),
      };
      const result = await window.slothVoice?.addServer(newEntry);
      const servers = (result ??
        []) as unknown as import("../../types").SavedServer[];
      const newServer =
        servers.find((s) => s.url === serverUrl) ??
        servers[servers.length - 1] ??
        newEntry;
      onAdded(newServer);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const displayUrl = resolvedUrl || input;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box max-w-md" onClick={(e) => e.stopPropagation()}>
        <p className="text-text-muted text-[10px] tracking-widest uppercase mb-1">
          // connect
        </p>
        <h2 className="modal-title">add a server</h2>

        {step === "input" ? (
          <form onSubmit={handleLookup} className="space-y-3">
            <div>
              <label className="label-xs">server url or invite code</label>
              <input
                className="input-field font-mono"
                placeholder="http://192.168.1.100:5000 or invite code"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                autoFocus
              />
              <p className="text-text-muted text-[10px] mt-1">
                Enter a server URL or paste an invite code to join directly.
              </p>
            </div>
            {error && <p className="text-danger text-xs font-mono">{error}</p>}
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={onClose} className="btn-ghost">
                cancel
              </button>
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="btn-primary"
              >
                {loading ? "looking up..." : "next →"}
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
                    {displayUrl}
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
                <button onClick={() => setStep("input")} className="btn-ghost">
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