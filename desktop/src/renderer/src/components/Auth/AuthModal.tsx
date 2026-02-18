import { useState } from "react";
import { useStore } from "../../store/useStore";
import { register, login } from "../../api/server";

interface Props {
  serverId: string;
  serverUrl: string;
  serverName: string;
  onClose: () => void;
}

export default function AuthModal({
  serverId,
  serverUrl,
  serverName,
  onClose,
}: Props) {
  const setSession = useStore((s) => s.setSession);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      let result: { token: string; user: any };
      if (mode === "login") {
        result = await login(serverUrl, username, password);
      } else {
        result = await register(
          serverUrl,
          username,
          password,
          displayName || username,
        );
      }
      setSession(serverId, {
        serverId,
        token: result.token,
        user: result.user,
      });
      onClose();
    } catch (err: any) {
      setError(
        err?.response?.data?.error || err.message || "Authentication failed",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box max-w-sm">
        <p className="text-text-muted text-[10px] tracking-widest uppercase mb-1">
          {mode === "login" ? "// sign in to" : "// register on"}
        </p>
        <h2 className="text-brand-primary text-sm font-semibold mb-4 truncate">
          {serverName}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label-xs">username</label>
            <input
              className="input-field"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              autoFocus
              required
            />
          </div>

          {mode === "register" && (
            <div>
              <label className="label-xs">display name</label>
              <input
                className="input-field"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="your name"
              />
            </div>
          )}

          <div>
            <label className="label-xs">password</label>
            <input
              className="input-field"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {error && <p className="text-danger text-xs font-mono">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? "loading…" : mode === "login" ? "sign in" : "register"}
          </button>
        </form>

        <p className="text-text-muted text-xs mt-4 text-center font-mono">
          {mode === "login" ? "no account?" : "already registered?"}{" "}
          <button
            onClick={() => setMode(mode === "login" ? "register" : "login")}
            className="text-brand-primary hover:underline"
          >
            {mode === "login" ? "register" : "sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
