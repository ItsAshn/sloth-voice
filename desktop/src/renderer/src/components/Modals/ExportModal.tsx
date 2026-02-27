import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useStore } from "../../store/useStore";

interface Props {
  onClose: () => void;
}

export default function ExportModal({ onClose }: Props) {
  const setSavedServers = useStore((s) => s.setSavedServers);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [jsonData, setJsonData] = useState("");
  const [tab, setTab] = useState<"qr" | "import">("qr");
  const [importText, setImportText] = useState("");
  const [status, setStatus] = useState("");
  const [statusIsError, setStatusIsError] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    window.slothVoice.exportServers().then(async (json) => {
      setJsonData(json);
      try {
        const url = await QRCode.toDataURL(json, {
          width: 280,
          margin: 1,
          color: { dark: "#c9cef0", light: "#0c0d17" },
        });
        setQrDataUrl(url);
      } catch (e) {
        console.error("QR too large:", e);
        setQrDataUrl("");
      }
    });
  }, []);

  const handleImport = async () => {
    try {
      const result = await window.slothVoice.importServers(importText.trim());
      // IPC returns { ok, servers?, error? }
      const res = result as unknown as {
        ok: boolean;
        servers?: import("../../types").SavedServer[];
        error?: string;
      };
      if (res.ok && res.servers) {
        setSavedServers(res.servers);
        setStatus(`imported ${res.servers.length} server(s).`);
        setStatusIsError(false);
      } else {
        setStatus(`error: ${res.error ?? "import failed"}`);
        setStatusIsError(true);
      }
    } catch {
      setStatus("invalid data. paste exported json.");
      setStatusIsError(true);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonData);
    setStatus("Copied to clipboard!");
    setStatusIsError(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box max-w-md" onClick={(e) => e.stopPropagation()}>
        <p className="text-text-muted text-[10px] tracking-widest uppercase mb-1">
          // data
        </p>
        <h2 className="modal-title">export / import</h2>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-surface-highest pb-2">
          <button
            onClick={() => setTab("qr")}
            className={`btn-ghost text-xs ${
              tab === "qr" ? "text-text-normal bg-surface-highest" : ""
            }`}
          >
            export (qr)
          </button>
          <button
            onClick={() => setTab("import")}
            className={`btn-ghost text-xs ${
              tab === "import" ? "text-text-normal bg-surface-highest" : ""
            }`}
          >
            import
          </button>
        </div>

        {tab === "qr" ? (
          <div className="space-y-3 text-center">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Server list QR"
                className="mx-auto rounded border border-surface-highest"
              />
            ) : (
              <p className="text-text-muted text-xs font-mono">
                too many servers for qr — use json export below
              </p>
            )}
            <button onClick={handleCopy} className="btn-ghost text-xs">
              copy json
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="label-xs">paste exported json</label>
            <textarea
              className="input-field h-28 resize-none font-mono text-xs"
              placeholder='{"servers":[...]}'
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <button onClick={handleImport} className="btn-primary w-full">
              import
            </button>
          </div>
        )}

        {status && (
          <p
            className={`${statusIsError ? "text-danger" : "text-success"} text-xs mt-3 text-center font-mono`}
          >
            {status}
          </p>
        )}

        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="btn-ghost">
            close
          </button>
        </div>
      </div>
    </div>
  );
}
