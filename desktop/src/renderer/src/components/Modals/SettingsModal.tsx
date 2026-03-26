import { useEffect, useState } from "react";
import { useStore } from "../../store/useStore";
import { useUpdaterActions } from "../../hooks/useUpdater";

interface Props {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: Props) {
  const {
    audioInputDeviceId,
    setAudioInputDeviceId,
    audioOutputDeviceId,
    setAudioOutputDeviceId,
    audioBitrateKbps,
    setAudioBitrateKbps,
    updateState,
    updateVersion,
    updateProgress,
    updateError,
  } = useStore();

  const { checkForUpdates, installUpdate, getVersion, isDev } = useUpdaterActions();
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDevMode, setIsDevMode] = useState(true);

  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    getVersion().then(setAppVersion);
    isDev().then(setIsDevMode);
  }, [getVersion, isDev]);

  useEffect(() => {
    async function loadDevices() {
      try {
        // Request permission first so labels are populated
        await navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((s) => s.getTracks().forEach((t) => t.stop()));
      } catch {
        setPermissionDenied(true);
        return;
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      setInputDevices(devices.filter((d) => d.kind === "audioinput"));
      setOutputDevices(devices.filter((d) => d.kind === "audiooutput"));
    }
    loadDevices();
  }, []);

  const handleCheckUpdates = async () => {
    setIsChecking(true);
    try {
      await checkForUpdates();
    } finally {
      setTimeout(() => setIsChecking(false), 1000);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="bg-surface-low border border-surface-mid rounded-lg w-[420px] max-h-[80vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-mid">
          <span className="text-text-normal text-sm font-semibold font-mono">
            // settings
          </span>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-normal text-xs font-mono transition-colors"
          >
            [esc]
          </button>
        </div>

        <div className="px-5 py-4 space-y-6">
          {permissionDenied && (
            <p className="text-danger text-[11px] font-mono bg-danger/10 border border-danger/30 rounded px-3 py-2">
              microphone permission denied — device labels unavailable
            </p>
          )}

          {/* Audio Input */}
          <section className="space-y-1.5">
            <p className="label-xs">» audio input (microphone)</p>
            <select
              value={audioInputDeviceId ?? ""}
              onChange={(e) => setAudioInputDeviceId(e.target.value || null)}
              className="w-full bg-surface-high border border-surface-highest rounded text-[11px] font-mono text-text-normal px-2 py-1.5 focus:outline-none focus:border-brand-primary"
            >
              <option value="">system default</option>
              {inputDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `microphone (${d.deviceId.slice(0, 8)}…)`}
                </option>
              ))}
            </select>
          </section>

          {/* Audio Output */}
          <section className="space-y-1.5">
            <p className="label-xs">» audio output (speakers / headphones)</p>
            {outputDevices.length === 0 ? (
              <p className="text-text-muted text-[11px] font-mono">
                output device selection not supported in this environment
              </p>
            ) : (
              <select
                value={audioOutputDeviceId ?? ""}
                onChange={(e) => setAudioOutputDeviceId(e.target.value || null)}
                className="w-full bg-surface-high border border-surface-highest rounded text-[11px] font-mono text-text-normal px-2 py-1.5 focus:outline-none focus:border-brand-primary"
              >
                <option value="">system default</option>
                {outputDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `speaker (${d.deviceId.slice(0, 8)}…)`}
                  </option>
                ))}
              </select>
            )}
          </section>

          {/* Bitrate */}
          <section className="space-y-1.5">
            <p className="label-xs">» voice bitrate</p>
            <select
              value={audioBitrateKbps}
              onChange={(e) => setAudioBitrateKbps(Number(e.target.value))}
              className="w-full bg-surface-high border border-surface-highest rounded text-[11px] font-mono text-text-normal px-2 py-1.5 focus:outline-none focus:border-brand-primary"
            >
              <option value={32}>32 kbps — low bandwidth</option>
              <option value={64}>64 kbps — balanced</option>
              <option value={96}>96 kbps</option>
              <option value={128}>128 kbps — high quality</option>
              <option value={192}>192 kbps</option>
              <option value={256}>256 kbps</option>
              <option value={320}>320 kbps — max quality</option>
            </select>
            <p className="text-text-muted text-[10px] font-mono">
              takes effect on next voice channel join
            </p>
          </section>

          {/* Updates */}
          <section className="space-y-1.5">
            <p className="label-xs">» app version</p>
            <div className="flex items-center justify-between">
              <span className="text-text-normal text-[11px] font-mono">
                v{appVersion ?? "—"}
              </span>
              {isDevMode && (
                <span className="text-warning text-[10px] font-mono">(dev build)</span>
              )}
            </div>
            {!isDevMode && (
              <>
                {updateState === "idle" && (
                  <button
                    onClick={handleCheckUpdates}
                    disabled={isChecking}
                    className="mt-2 bg-surface-high hover:bg-surface-highest border border-surface-highest text-text-normal text-[11px] font-mono px-3 py-1.5 rounded transition-colors disabled:opacity-50"
                  >
                    {isChecking ? "checking…" : "check for updates"}
                  </button>
                )}
                {updateState === "checking" && (
                  <p className="text-text-muted text-[11px] font-mono mt-1">
                    checking for updates…
                  </p>
                )}
                {updateState === "downloading" && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                      <span className="text-text-muted">downloading {updateVersion}</span>
                      <span className="text-text-normal">{updateProgress}%</span>
                    </div>
                    <div className="h-1 bg-surface-highest rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-primary transition-all duration-300"
                        style={{ width: `${updateProgress}%` }}
                      />
                    </div>
                  </div>
                )}
                {updateState === "ready" && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-success text-[11px] font-mono">
                      update ready ({updateVersion})
                    </span>
                    <button
                      onClick={installUpdate}
                      className="bg-success hover:bg-success/80 text-surface-lowest text-[11px] font-mono px-3 py-1 rounded transition-colors"
                    >
                      restart now
                    </button>
                  </div>
                )}
                {updateState === "error" && (
                  <div className="mt-2 space-y-1">
                    <p className="text-danger text-[11px] font-mono">
                      update failed: {updateError}
                    </p>
                    <button
                      onClick={handleCheckUpdates}
                      disabled={isChecking}
                      className="bg-surface-high hover:bg-surface-highest border border-surface-highest text-text-normal text-[11px] font-mono px-3 py-1.5 rounded transition-colors disabled:opacity-50"
                    >
                      try again
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </div>

        <div className="px-5 py-3 border-t border-surface-mid flex justify-end">
          <button onClick={onClose} className="btn-primary text-xs py-1 px-4">
            done
          </button>
        </div>
      </div>
    </div>
  );
}
