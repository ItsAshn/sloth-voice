import { useRef, useState } from "react";
import { useStore } from "../../store/useStore";
import {
  configureApi,
  updateProfile,
  updateServerSettings,
  fetchMembers,
} from "../../api/server";

/** Resize an image dataURL to at most maxPx on the longest side, JPEG quality 0.82 */
function resizeImage(dataUrl: string, maxPx = 512): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(maxPx / img.width, maxPx / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => reject(new Error("failed to load image"));
    img.src = dataUrl;
  });
}

interface Props {
  onClose: () => void;
}

export default function ServerMenuModal({ onClose }: Props) {
  const {
    activeServer,
    sessions,
    updateSessionUser,
    updateActiveServerName,
    setSavedServers,
    savedServers,
    clearSession,
  } = useStore();

  const session = activeServer ? sessions[activeServer.id] : undefined;
  const isAdmin = session?.user?.role === "admin";

  // Profile state
  const [displayName, setDisplayName] = useState(
    session?.user?.display_name ?? "",
  );
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    session?.user?.avatar ?? null,
  );
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Server settings state
  const [serverName, setServerName] = useState(activeServer?.name ?? "");
  const [serverSaving, setServerSaving] = useState(false);
  const [serverMsg, setServerMsg] = useState<string | null>(null);

  // Holds the raw File object so we can read it as base64 at save time
  const pendingAvatarFile = useRef<File | null>(null);
  // Holds the blob URL used only for the preview <img>
  const blobPreviewUrl = useRef<string | null>(null);

  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProfileMsg(null);

    // Revoke previous blob URL to avoid memory leaks
    if (blobPreviewUrl.current) {
      URL.revokeObjectURL(blobPreviewUrl.current);
    }

    const objectUrl = URL.createObjectURL(file);
    blobPreviewUrl.current = objectUrl;
    pendingAvatarFile.current = file;

    // Use the blob URL as preview — works instantly for any image format
    setAvatarPreview(objectUrl);
    setAvatarChanged(true);

    // Reset so the same file can be picked again
    e.target.value = "";
  };

  /** Convert a File to a base64 data URL via FileReader */
  function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("failed to read file"));
      reader.readAsDataURL(file);
    });
  }

  const handleSaveProfile = async () => {
    if (!activeServer || !session) return;
    setProfileSaving(true);
    setProfileMsg(null);
    configureApi(activeServer.url, session.token);
    try {
      let avatarPayload: string | null | undefined = undefined;
      if (avatarChanged) {
        if (avatarPreview === null) {
          avatarPayload = null; // explicit removal
          pendingAvatarFile.current = null;
        } else if (pendingAvatarFile.current) {
          // Convert the raw File to base64 here, outside of any event callback
          const dataUrl = await fileToDataUrl(pendingAvatarFile.current);
          try {
            avatarPayload = await resizeImage(dataUrl, 512);
          } catch {
            avatarPayload = dataUrl;
          }
        }
        // If no pending file and preview is still set, it was an existing avatar
        // that wasn't changed — skip sending it
      }
      const updated = await updateProfile(displayName, avatarPayload);
      updateSessionUser(activeServer.id, updated);
      setAvatarChanged(false);
      pendingAvatarFile.current = null;
      // Refresh members list so the updated avatar appears immediately
      fetchMembers()
        .then((ms) => useStore.getState().setMembers(ms))
        .catch(() => {});
      setProfileMsg("saved");
    } catch (err: unknown) {
      if (
        (err as { response?: { status?: number } })?.response?.status === 401
      ) {
        clearSession(activeServer.id);
        onClose();
        return;
      }
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? "error saving profile";
      setProfileMsg(msg);
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSaveServerName = async () => {
    if (!activeServer || !session) return;
    setServerSaving(true);
    setServerMsg(null);
    configureApi(activeServer.url, session.token);
    try {
      const res = await updateServerSettings(serverName);
      updateActiveServerName(res.name);
      // Also persist into savedServers so the rail shows the new name immediately
      const updated = savedServers.map((s) =>
        s.id === activeServer?.id ? { ...s, name: res.name } : s,
      );
      setSavedServers(updated);
      setServerMsg("saved");
    } catch (err: unknown) {
      if (
        (err as { response?: { status?: number } })?.response?.status === 401
      ) {
        clearSession(activeServer.id);
        onClose();
        return;
      }
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? "error saving server name";
      setServerMsg(msg);
    } finally {
      setServerSaving(false);
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
            // server menu
          </span>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-normal text-xs font-mono transition-colors"
          >
            [esc]
          </button>
        </div>

        <div className="px-5 py-4 space-y-6">
          {/* Profile section */}
          <section className="space-y-3">
            <p className="label-xs">» your profile</p>

            {/* Avatar */}
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded bg-brand-primary flex items-center justify-center text-white text-sm font-bold font-mono shrink-0 overflow-hidden cursor-pointer border border-surface-highest hover:border-brand-primary transition-colors relative"
                onClick={() => fileRef.current?.click()}
                title="click to change avatar"
              >
                <span>
                  {(displayName || session?.user?.display_name || "?")
                    .slice(0, 1)
                    .toUpperCase()}
                </span>
                {avatarPreview && (
                  <img
                    src={avatarPreview}
                    alt="avatar"
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display =
                        "none";
                    }}
                  />
                )}
              </div>
              <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="btn-ghost text-xs py-1"
                >
                  upload image
                </button>
                {avatarPreview && (
                  <button
                    onClick={() => {
                      if (blobPreviewUrl.current) {
                        URL.revokeObjectURL(blobPreviewUrl.current);
                        blobPreviewUrl.current = null;
                      }
                      pendingAvatarFile.current = null;
                      setAvatarPreview(null);
                      setAvatarChanged(true);
                    }}
                    className="text-text-muted hover:text-danger text-[11px] font-mono transition-colors"
                  >
                    remove avatar
                  </button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarFile}
              />
            </div>

            {/* Display name */}
            <div className="space-y-1">
              <label className="text-text-muted text-[10px] font-mono uppercase tracking-wider">
                display name
              </label>
              <input
                className="input-field"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="display name"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveProfile}
                disabled={profileSaving}
                className="btn-primary text-xs py-1 px-4"
              >
                {profileSaving ? "…" : "save profile"}
              </button>
              {profileMsg && (
                <span
                  className={`text-[11px] font-mono ${profileMsg === "saved" ? "text-success" : "text-danger"}`}
                >
                  {profileMsg}
                </span>
              )}
            </div>
          </section>

          {/* Server settings — admin only */}
          {isAdmin && (
            <section className="space-y-3 border-t border-surface-highest pt-5">
              <p className="label-xs">» server settings</p>

              <div className="space-y-1">
                <label className="text-text-muted text-[10px] font-mono uppercase tracking-wider">
                  server name
                </label>
                <input
                  className="input-field"
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  placeholder="server name"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveServerName}
                  disabled={serverSaving}
                  className="btn-primary text-xs py-1 px-4"
                >
                  {serverSaving ? "…" : "save server name"}
                </button>
                {serverMsg && (
                  <span
                    className={`text-[11px] font-mono ${serverMsg === "saved" ? "text-success" : "text-danger"}`}
                  >
                    {serverMsg}
                  </span>
                )}
              </div>
            </section>
          )}
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
