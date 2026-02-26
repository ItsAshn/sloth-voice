import { useEffect, useState } from "react";
import { useStore } from "../../store/useStore";

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
  } = useStore();

  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

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
