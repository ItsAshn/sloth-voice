import { useStore } from "../../store/useStore";
import { useUpdaterActions } from "../../hooks/useUpdater";

export default function UpdateBanner() {
  const updateState = useStore((s) => s.updateState);
  const updateProgress = useStore((s) => s.updateProgress);
  const updateVersion = useStore((s) => s.updateVersion);
  const updateError = useStore((s) => s.updateError);
  const { installUpdate } = useUpdaterActions();

  if (updateState === "idle") return null;

  if (updateState === "error") {
    return (
      <div className="bg-danger/10 border-b border-danger/30 px-4 py-2 text-xs font-mono text-danger">
        update failed: {updateError ?? "unknown error"}
      </div>
    );
  }

  if (updateState === "checking") {
    return (
      <div className="bg-brand-primary/10 border-b border-brand-primary/30 px-4 py-2 text-xs font-mono text-text-muted">
        checking for updates…
      </div>
    );
  }

  if (updateState === "downloading") {
    return (
      <div className="bg-brand-primary/10 border-b border-brand-primary/30 px-4 py-2">
        <div className="flex items-center justify-between text-xs font-mono mb-1">
          <span className="text-text-muted">downloading update {updateVersion}</span>
          <span className="text-text-normal">{updateProgress}%</span>
        </div>
        <div className="h-1 bg-surface-highest rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-primary transition-all duration-300"
            style={{ width: `${updateProgress}%` }}
          />
        </div>
      </div>
    );
  }

  if (updateState === "ready") {
    return (
      <div className="bg-success/10 border-b border-success/30 px-4 py-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-success">
            update ready ({updateVersion}) — restart to apply
          </span>
          <button
            onClick={installUpdate}
            className="bg-success hover:bg-success/80 text-surface-lowest text-xs font-mono px-3 py-1 rounded transition-colors"
          >
            restart now
          </button>
        </div>
      </div>
    );
  }

  return null;
}