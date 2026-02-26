import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useStore } from "../../store/useStore";
import {
  configureApi,
  updateProfile,
  updateServerSettings,
  fetchMembers,
  createInvite,
  fetchInvites,
  revokeInvite,
  setMemberRole,
  kickMember,
  assignCustomRole,
  fetchRoles,
  createRole,
  updateRole,
  deleteRole,
} from "../../api/server";
import type { InviteCode, Member, CustomRole, Permission } from "../../types";

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

function formatExpiry(expiresAt: number | null): string {
  if (!expiresAt) return "never";
  const diff = expiresAt - Math.floor(Date.now() / 1000);
  if (diff <= 0) return "expired";
  if (diff < 3600) return `${Math.ceil(diff / 60)}m`;
  if (diff < 86400) return `${Math.ceil(diff / 3600)}h`;
  return `${Math.ceil(diff / 86400)}d`;
}

type AdminTab = "settings" | "members" | "invites" | "roles";

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
    members,
    setMembers,
  } = useStore();

  const session = activeServer ? sessions[activeServer.id] : undefined;
  const isAdmin = session?.user?.role === "admin";

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // ─── Profile ──────────────────────────────────────────────────────────────
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
  const pendingAvatarFile = useRef<File | null>(null);
  const blobPreviewUrl = useRef<string | null>(null);

  // ─── Admin tab ────────────────────────────────────────────────────────────
  const [adminTab, setAdminTab] = useState<AdminTab>("settings");

  // ─── Server settings ──────────────────────────────────────────────────────
  const [serverName, setServerName] = useState(activeServer?.name ?? "");
  const [serverSaving, setServerSaving] = useState(false);
  const [serverMsg, setServerMsg] = useState<string | null>(null);

  // ─── Members ──────────────────────────────────────────────────────────────
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberMsg, setMemberMsg] = useState<Record<string, string>>({});

  // ─── Invites ──────────────────────────────────────────────────────────────
  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [newMaxUses, setNewMaxUses] = useState<string>("");
  const [newExpiry, setNewExpiry] = useState<string>("0");
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [activeQr, setActiveQr] = useState<{
    code: string;
    dataUrl: string;
  } | null>(null);

  // ─── Roles ─────────────────────────────────────────────────────────────
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  // new role form
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleColor, setNewRoleColor] = useState("#5865f2");
  const [newRolePerms, setNewRolePerms] = useState<
    Partial<Record<Permission, boolean>>
  >({});
  const [creatingRole, setCreatingRole] = useState(false);
  // inline editing
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editPerms, setEditPerms] = useState<
    Partial<Record<Permission, boolean>>
  >({});
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  // custom role assignment per member (keyed by userId)
  const [assigningRole, setAssigningRole] = useState<Record<string, boolean>>(
    {},
  );

  // ─── Helpers ───────────────────────────────────────────────────────────────
  function ensureApi() {
    if (!activeServer || !session) return false;
    configureApi(activeServer.url, session.token);
    return true;
  }

  function handleApiErr(err: unknown, fallback: string): string {
    if ((err as { response?: { status?: number } })?.response?.status === 401) {
      if (activeServer) clearSession(activeServer.id);
      onClose();
      return fallback;
    }
    return (
      (err as { response?: { data?: { error?: string } } })?.response?.data
        ?.error ?? fallback
    );
  }

  // ─── Load data when admin tabs become active ───────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    if (adminTab === "members") {
      if (!ensureApi()) return;
      setMembersLoading(true);
      fetchMembers()
        .then((ms) => setMembers(ms))
        .catch(console.error)
        .finally(() => setMembersLoading(false));
      // roles are needed for the custom-role assignment select
      loadRoles();
    } else if (adminTab === "invites") {
      loadInvites();
    } else if (adminTab === "roles") {
      loadRoles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminTab, isAdmin]);

  async function loadInvites() {
    if (!ensureApi()) return;
    setInvitesLoading(true);
    try {
      setInvites(await fetchInvites());
    } catch (err) {
      console.error(err);
    } finally {
      setInvitesLoading(false);
    }
  }

  async function loadRoles() {
    if (!ensureApi()) return;
    setRolesLoading(true);
    try {
      setRoles(await fetchRoles());
    } catch (err) {
      console.error(err);
    } finally {
      setRolesLoading(false);
    }
  }

  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfileMsg(null);
    if (blobPreviewUrl.current) URL.revokeObjectURL(blobPreviewUrl.current);
    const objectUrl = URL.createObjectURL(file);
    blobPreviewUrl.current = objectUrl;
    pendingAvatarFile.current = file;
    setAvatarPreview(objectUrl);
    setAvatarChanged(true);
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
          avatarPayload = null;
          pendingAvatarFile.current = null;
        } else if (pendingAvatarFile.current) {
          const dataUrl = await fileToDataUrl(pendingAvatarFile.current);
          try {
            avatarPayload = await resizeImage(dataUrl, 512);
          } catch {
            avatarPayload = dataUrl;
          }
        }
      }
      const updated = await updateProfile(displayName, avatarPayload);
      updateSessionUser(activeServer.id, updated);
      setAvatarChanged(false);
      pendingAvatarFile.current = null;
      fetchMembers()
        .then((ms) => setMembers(ms))
        .catch(() => {});
      setProfileMsg("saved");
    } catch (err: unknown) {
      setProfileMsg(handleApiErr(err, "error saving profile"));
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
      setSavedServers(
        savedServers.map((s) =>
          s.id === activeServer.id ? { ...s, name: res.name } : s,
        ),
      );
      setServerMsg("saved");
    } catch (err: unknown) {
      setServerMsg(handleApiErr(err, "error saving server name"));
    } finally {
      setServerSaving(false);
    }
  };

  // ─── Member management handlers ──────────────────────────────────────────
  const handleToggleRole = async (m: Member) => {
    if (!ensureApi()) return;
    const newRole = m.role === "admin" ? "member" : "admin";
    try {
      await setMemberRole(m.id, newRole);
      setMembers(
        members.map((x) => (x.id === m.id ? { ...x, role: newRole } : x)),
      );
      setMemberMsg((prev) => ({ ...prev, [m.id]: `role → ${newRole}` }));
      setTimeout(
        () =>
          setMemberMsg((prev) => {
            const n = { ...prev };
            delete n[m.id];
            return n;
          }),
        2000,
      );
    } catch (err) {
      setMemberMsg((prev) => ({ ...prev, [m.id]: handleApiErr(err, "error") }));
    }
  };

  const handleKick = async (m: Member) => {
    if (
      !confirm(
        `Kick ${m.display_name || m.username}? They can rejoin via invite.`,
      )
    )
      return;
    if (!ensureApi()) return;
    try {
      await kickMember(m.id);
      setMembers(members.filter((x) => x.id !== m.id));
    } catch (err) {
      setMemberMsg((prev) => ({ ...prev, [m.id]: handleApiErr(err, "error") }));
    }
  };

  const handleAssignCustomRole = async (
    userId: string,
    roleId: string | null,
  ) => {
    if (!ensureApi()) return;
    setAssigningRole((prev) => ({ ...prev, [userId]: true }));
    try {
      await assignCustomRole(userId, roleId);
      setMembers(
        members.map((x) =>
          x.id === userId
            ? {
                ...x,
                custom_role_id: roleId,
                custom_role_name:
                  roles.find((r) => r.id === roleId)?.name ?? null,
                custom_role_color:
                  roles.find((r) => r.id === roleId)?.color ?? null,
              }
            : x,
        ),
      );
    } catch (err) {
      console.error(err);
    } finally {
      setAssigningRole((prev) => ({ ...prev, [userId]: false }));
    }
  };

  // ─── Role management handlers ───────────────────────────────────────────
  const ALL_PERMISSIONS: { key: Permission; label: string }[] = [
    { key: "send_messages", label: "send messages" },
    { key: "manage_channels", label: "manage channels" },
    { key: "delete_messages", label: "delete messages" },
    { key: "kick_members", label: "kick members" },
    { key: "manage_invites", label: "manage invites" },
  ];

  const handleCreateRole = async () => {
    if (!newRoleName.trim() || !ensureApi()) return;
    setCreatingRole(true);
    try {
      const role = await createRole(
        newRoleName.trim(),
        newRoleColor,
        newRolePerms,
      );
      setRoles((prev) => [...prev, role]);
      setNewRoleName("");
      setNewRoleColor("#5865f2");
      setNewRolePerms({});
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingRole(false);
    }
  };

  const handleStartEditRole = (role: CustomRole) => {
    setEditingRoleId(role.id);
    setEditName(role.name);
    setEditColor(role.color);
    setEditPerms({ ...role.permissions });
  };

  const handleSaveRole = async (id: string) => {
    if (!ensureApi()) return;
    setSavingRoleId(id);
    try {
      const updated = await updateRole(id, editName, editColor, editPerms);
      setRoles((prev) => prev.map((r) => (r.id === id ? updated : r)));
      // Refresh member list so badges update
      setMembers(
        members.map((m) =>
          m.custom_role_id === id
            ? {
                ...m,
                custom_role_name: updated.name,
                custom_role_color: updated.color,
              }
            : m,
        ),
      );
      setEditingRoleId(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingRoleId(null);
    }
  };

  const handleDeleteRole = async (id: string) => {
    if (!confirm("Delete this role? It will be unassigned from all members."))
      return;
    if (!ensureApi()) return;
    try {
      await deleteRole(id);
      setRoles((prev) => prev.filter((r) => r.id !== id));
      setMembers(
        members.map((m) =>
          m.custom_role_id === id
            ? {
                ...m,
                custom_role_id: null,
                custom_role_name: null,
                custom_role_color: null,
              }
            : m,
        ),
      );
      if (editingRoleId === id) setEditingRoleId(null);
    } catch (err) {
      console.error(err);
    }
  };

  // ─── Invite handlers ──────────────────────────────────────────────────────────
  const EXPIRY_OPTIONS = [
    { label: "never", value: "0" },
    { label: "1 hour", value: "1" },
    { label: "6 hours", value: "6" },
    { label: "12 hours", value: "12" },
    { label: "1 day", value: "24" },
    { label: "7 days", value: "168" },
    { label: "30 days", value: "720" },
  ];

  const handleCreateInvite = async () => {
    if (!ensureApi()) return;
    setCreatingInvite(true);
    try {
      const maxUses = newMaxUses ? parseInt(newMaxUses, 10) : undefined;
      const expiresInHours =
        newExpiry !== "0" ? parseFloat(newExpiry) : undefined;
      const invite = await createInvite(maxUses, expiresInHours);
      setInvites((prev) => [invite, ...prev]);
      const deepLink = `sloth-voice://join?server=${encodeURIComponent(activeServer!.url)}&code=${invite.code}`;
      const qrDataUrl = await QRCode.toDataURL(deepLink, {
        width: 200,
        margin: 2,
        color: { dark: "#f2f3f5", light: "#1e1f22" },
      });
      setActiveQr({ code: invite.code, dataUrl: qrDataUrl });
      setNewMaxUses("");
      setNewExpiry("0");
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleShowQr = async (invite: InviteCode) => {
    if (activeQr?.code === invite.code) {
      setActiveQr(null);
      return;
    }
    const deepLink = `sloth-voice://join?server=${encodeURIComponent(activeServer!.url)}&code=${invite.code}`;
    const qrDataUrl = await QRCode.toDataURL(deepLink, {
      width: 200,
      margin: 2,
      color: { dark: "#f2f3f5", light: "#1e1f22" },
    });
    setActiveQr({ code: invite.code, dataUrl: qrDataUrl });
  };

  const handleRevokeInvite = async (code: string) => {
    if (!ensureApi()) return;
    try {
      await revokeInvite(code);
      setInvites((prev) => prev.filter((i) => i.code !== code));
      if (activeQr?.code === code) setActiveQr(null);
    } catch (err) {
      console.error(err);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="bg-surface-low border border-surface-mid rounded-lg w-[460px] max-h-[85vh] overflow-y-auto shadow-2xl"
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
          {/* ── Profile ────────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <p className="label-xs">» your profile</p>

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

          {/* ── Admin panels ────────────────────────────────────────────── */}
          {isAdmin && (
            <section className="border-t border-surface-highest pt-5 space-y-4">
              <p className="label-xs">» admin</p>

              {/* Tab bar */}
              <div className="flex gap-1 bg-surface-high rounded p-0.5">
                {(
                  ["settings", "members", "invites", "roles"] as AdminTab[]
                ).map((t) => (
                  <button
                    key={t}
                    onClick={() => setAdminTab(t)}
                    className={`flex-1 text-[11px] font-mono py-1.5 rounded transition-colors ${
                      adminTab === t
                        ? "bg-surface-highest text-text-normal"
                        : "text-text-muted hover:text-text-normal"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* ── Settings tab ── */}
              {adminTab === "settings" && (
                <div className="space-y-3">
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
                </div>
              )}

              {/* ── Members tab ── */}
              {adminTab === "members" && (
                <div className="space-y-2">
                  {membersLoading ? (
                    <p className="text-text-muted text-[11px] font-mono text-center py-4">
                      loading…
                    </p>
                  ) : members.length === 0 ? (
                    <p className="text-text-muted text-[11px] font-mono text-center py-4">
                      no members
                    </p>
                  ) : (
                    members.map((m) => {
                      const isSelf = m.id === session?.user?.id;
                      return (
                        <div
                          key={m.id}
                          className="flex items-center gap-2 px-2.5 py-2 rounded bg-surface-high border border-surface-mid"
                        >
                          {/* Avatar */}
                          <div className="w-7 h-7 rounded bg-brand-primary/20 border border-brand-primary/30 flex items-center justify-center text-[10px] font-bold text-brand-primary shrink-0 overflow-hidden relative">
                            <span>
                              {(m.display_name || m.username)
                                .slice(0, 1)
                                .toUpperCase()}
                            </span>
                            {m.avatar && (
                              <img
                                src={m.avatar}
                                alt=""
                                className="absolute inset-0 w-full h-full object-cover"
                                onError={(e) => {
                                  (
                                    e.currentTarget as HTMLImageElement
                                  ).style.display = "none";
                                }}
                              />
                            )}
                          </div>

                          {/* Name + role */}
                          <div className="flex-1 min-w-0">
                            <p className="text-text-normal text-[11px] font-medium truncate">
                              {m.display_name || m.username}
                              {isSelf && (
                                <span className="ml-1 text-brand-primary text-[9px]">
                                  (you)
                                </span>
                              )}
                            </p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p
                                className={`text-[10px] font-mono ${
                                  m.role === "admin"
                                    ? "text-brand-primary"
                                    : "text-text-muted"
                                }`}
                              >
                                {m.role ?? "member"}
                              </p>
                              {m.custom_role_name && (
                                <span
                                  className="text-[9px] font-mono px-1.5 py-0.5 rounded-full border leading-none"
                                  style={{
                                    color: m.custom_role_color ?? "#5865f2",
                                    borderColor:
                                      (m.custom_role_color ?? "#5865f2") + "66",
                                    backgroundColor:
                                      (m.custom_role_color ?? "#5865f2") + "22",
                                  }}
                                >
                                  {m.custom_role_name}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Feedback msg */}
                          {memberMsg[m.id] && (
                            <span className="text-[10px] font-mono text-success shrink-0">
                              {memberMsg[m.id]}
                            </span>
                          )}

                          {/* Actions */}
                          {!isSelf && (
                            <div className="flex flex-col gap-1 shrink-0">
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => handleToggleRole(m)}
                                  title={
                                    m.role === "admin"
                                      ? "demote to member"
                                      : "promote to admin"
                                  }
                                  className="text-[10px] font-mono px-2 py-1 rounded bg-surface-highest hover:bg-brand-primary/20 text-text-muted hover:text-brand-primary border border-surface-mid transition-colors"
                                >
                                  {m.role === "admin" ? "demote" : "promote"}
                                </button>
                                <button
                                  onClick={() => handleKick(m)}
                                  title="kick from server"
                                  className="text-[10px] font-mono px-2 py-1 rounded bg-surface-highest hover:bg-danger/20 text-text-muted hover:text-danger border border-surface-mid transition-colors"
                                >
                                  kick
                                </button>
                              </div>
                              {roles.length > 0 && (
                                <select
                                  value={m.custom_role_id ?? ""}
                                  disabled={assigningRole[m.id]}
                                  onChange={(e) =>
                                    handleAssignCustomRole(
                                      m.id,
                                      e.target.value || null,
                                    )
                                  }
                                  className="w-full bg-surface-high border border-surface-mid rounded text-[10px] font-mono text-text-muted px-1.5 py-0.5 focus:outline-none focus:border-brand-primary"
                                >
                                  <option value="">no role</option>
                                  {roles.map((r) => (
                                    <option key={r.id} value={r.id}>
                                      {r.name}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* ── Invites tab ── */}
              {adminTab === "invites" && (
                <div className="space-y-4">
                  {/* Create invite form */}
                  <div className="bg-surface-high border border-surface-mid rounded p-3 space-y-3">
                    <p className="text-text-muted text-[10px] font-mono uppercase tracking-wider">
                      create invite
                    </p>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-text-muted text-[10px] font-mono">
                          max uses (blank = ∞)
                        </label>
                        <input
                          type="number"
                          min="1"
                          className="input-field text-xs"
                          placeholder="unlimited"
                          value={newMaxUses}
                          onChange={(e) => setNewMaxUses(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-text-muted text-[10px] font-mono">
                          expires after
                        </label>
                        <select
                          className="w-full bg-surface-high border border-surface-highest rounded text-[11px] font-mono text-text-normal px-2 py-1.5 focus:outline-none focus:border-brand-primary"
                          value={newExpiry}
                          onChange={(e) => setNewExpiry(e.target.value)}
                        >
                          {EXPIRY_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <button
                      onClick={handleCreateInvite}
                      disabled={creatingInvite}
                      className="btn-primary text-xs py-1 px-4 w-full"
                    >
                      {creatingInvite ? "…" : "+ generate invite code"}
                    </button>
                  </div>

                  {/* QR code display */}
                  {activeQr && (
                    <div className="flex flex-col items-center gap-2 bg-surface-high border border-brand-primary/40 rounded p-3">
                      <p className="text-brand-primary text-[10px] font-mono uppercase tracking-wider">
                        invite code
                      </p>
                      <img
                        src={activeQr.dataUrl}
                        alt="QR code"
                        className="rounded"
                        style={{ imageRendering: "pixelated" }}
                      />
                      <div className="flex items-center gap-2">
                        <code className="text-text-normal text-sm font-mono font-bold tracking-widest bg-surface-highest px-3 py-1 rounded border border-surface-mid">
                          {activeQr.code}
                        </code>
                        <button
                          onClick={() =>
                            navigator.clipboard.writeText(activeQr.code)
                          }
                          className="text-[10px] font-mono text-text-muted hover:text-text-normal transition-colors"
                        >
                          copy
                        </button>
                      </div>
                      <p className="text-text-muted text-[10px] font-mono text-center">
                        share this code or scan the QR to join the server
                      </p>
                      <button
                        onClick={() => setActiveQr(null)}
                        className="text-text-muted hover:text-text-normal text-[10px] font-mono"
                      >
                        dismiss
                      </button>
                    </div>
                  )}

                  {/* Active invites list */}
                  <div className="space-y-2">
                    <p className="text-text-muted text-[10px] font-mono uppercase tracking-wider">
                      active codes{" "}
                      {invitesLoading ? "…" : `(${invites.length})`}
                    </p>
                    {!invitesLoading && invites.length === 0 && (
                      <p className="text-text-muted text-[11px] font-mono text-center py-2">
                        no active invite codes
                      </p>
                    )}
                    {invites.map((inv) => (
                      <div
                        key={inv.code}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded border transition-colors ${
                          activeQr?.code === inv.code
                            ? "bg-surface-high border-brand-primary/40"
                            : "bg-surface-high border-surface-mid"
                        }`}
                      >
                        <code className="text-text-normal text-[12px] font-mono font-bold tracking-widest flex-1 min-w-0 truncate">
                          {inv.code}
                        </code>
                        <div className="shrink-0 text-right space-y-0.5">
                          <p className="text-text-muted text-[10px] font-mono">
                            {inv.uses}/{inv.max_uses ?? "∞"} uses
                          </p>
                          <p className="text-text-muted text-[10px] font-mono">
                            exp: {formatExpiry(inv.expires_at)}
                          </p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => handleShowQr(inv)}
                            title="show QR code"
                            className="text-[10px] font-mono px-2 py-1 rounded bg-surface-highest hover:bg-brand-primary/20 text-text-muted hover:text-brand-primary border border-surface-mid transition-colors"
                          >
                            qr
                          </button>
                          <button
                            onClick={() => handleRevokeInvite(inv.code)}
                            title="revoke invite"
                            className="text-[10px] font-mono px-2 py-1 rounded bg-surface-highest hover:bg-danger/20 text-text-muted hover:text-danger border border-surface-mid transition-colors"
                          >
                            revoke
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* ── Roles tab ── */}
              {adminTab === "roles" && (
                <div className="space-y-4">
                  {/* Create new role form */}
                  <div className="bg-surface-high border border-surface-mid rounded p-3 space-y-3">
                    <p className="text-text-muted text-[10px] font-mono uppercase tracking-wider">
                      create new role
                    </p>

                    <div className="flex gap-2">
                      <input
                        className="input-field flex-1 text-xs"
                        placeholder="role name"
                        value={newRoleName}
                        onChange={(e) => setNewRoleName(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && handleCreateRole()
                        }
                      />
                      <div className="flex items-center gap-1.5 shrink-0">
                        <label className="text-text-muted text-[10px] font-mono">
                          color
                        </label>
                        <input
                          type="color"
                          value={newRoleColor}
                          onChange={(e) => setNewRoleColor(e.target.value)}
                          className="w-8 h-7 rounded border border-surface-mid bg-surface-high cursor-pointer"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-text-muted text-[10px] font-mono">
                        permissions
                      </p>
                      <div className="grid grid-cols-2 gap-1">
                        {ALL_PERMISSIONS.map((p) => (
                          <label
                            key={p.key}
                            className="flex items-center gap-2 cursor-pointer group"
                          >
                            <input
                              type="checkbox"
                              checked={!!newRolePerms[p.key]}
                              onChange={(e) =>
                                setNewRolePerms((prev) => ({
                                  ...prev,
                                  [p.key]: e.target.checked,
                                }))
                              }
                              className="accent-brand-primary"
                            />
                            <span className="text-[10px] font-mono text-text-muted group-hover:text-text-normal transition-colors">
                              {p.label}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={handleCreateRole}
                      disabled={creatingRole || !newRoleName.trim()}
                      className="btn-primary text-xs py-1 px-4 w-full"
                    >
                      {creatingRole ? "…" : "+ create role"}
                    </button>
                  </div>

                  {/* Role list */}
                  <div className="space-y-2">
                    <p className="text-text-muted text-[10px] font-mono uppercase tracking-wider">
                      roles {rolesLoading ? "…" : `(${roles.length})`}
                    </p>

                    {!rolesLoading && roles.length === 0 && (
                      <p className="text-text-muted text-[11px] font-mono text-center py-2">
                        no custom roles yet
                      </p>
                    )}

                    {roles.map((role) => {
                      const isEditing = editingRoleId === role.id;
                      return (
                        <div
                          key={role.id}
                          className="bg-surface-high border border-surface-mid rounded p-2.5 space-y-2"
                        >
                          {/* Role header row */}
                          <div className="flex items-center gap-2">
                            {/* Color swatch */}
                            <span
                              className="w-3 h-3 rounded-full shrink-0 border border-white/10"
                              style={{
                                backgroundColor: isEditing
                                  ? editColor
                                  : role.color,
                              }}
                            />

                            {isEditing ? (
                              <>
                                <input
                                  className="input-field flex-1 text-xs py-0.5"
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                />
                                <input
                                  type="color"
                                  value={editColor}
                                  onChange={(e) => setEditColor(e.target.value)}
                                  className="w-7 h-6 rounded border border-surface-mid bg-surface-high cursor-pointer shrink-0"
                                />
                              </>
                            ) : (
                              <span
                                className="text-[11px] font-mono font-semibold flex-1 min-w-0 truncate"
                                style={{ color: role.color }}
                              >
                                {role.name}
                              </span>
                            )}

                            {/* Action buttons */}
                            <div className="flex gap-1 shrink-0">
                              {isEditing ? (
                                <>
                                  <button
                                    onClick={() => handleSaveRole(role.id)}
                                    disabled={savingRoleId === role.id}
                                    className="text-[10px] font-mono px-2 py-1 rounded bg-surface-highest hover:bg-brand-primary/20 text-text-muted hover:text-brand-primary border border-surface-mid transition-colors"
                                  >
                                    {savingRoleId === role.id ? "…" : "save"}
                                  </button>
                                  <button
                                    onClick={() => setEditingRoleId(null)}
                                    className="text-[10px] font-mono px-2 py-1 rounded bg-surface-highest text-text-muted hover:text-text-normal border border-surface-mid transition-colors"
                                  >
                                    cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => handleStartEditRole(role)}
                                    className="text-[10px] font-mono px-2 py-1 rounded bg-surface-highest hover:bg-brand-primary/20 text-text-muted hover:text-brand-primary border border-surface-mid transition-colors"
                                  >
                                    edit
                                  </button>
                                  <button
                                    onClick={() => handleDeleteRole(role.id)}
                                    className="text-[10px] font-mono px-2 py-1 rounded bg-surface-highest hover:bg-danger/20 text-text-muted hover:text-danger border border-surface-mid transition-colors"
                                  >
                                    delete
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Permissions grid */}
                          <div className="grid grid-cols-2 gap-1">
                            {ALL_PERMISSIONS.map((p) => {
                              const permsSource = isEditing
                                ? editPerms
                                : role.permissions;
                              return (
                                <label
                                  key={p.key}
                                  className={`flex items-center gap-2 ${
                                    isEditing
                                      ? "cursor-pointer group"
                                      : "cursor-default"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={!!permsSource[p.key]}
                                    disabled={!isEditing}
                                    onChange={(e) =>
                                      isEditing &&
                                      setEditPerms((prev) => ({
                                        ...prev,
                                        [p.key]: e.target.checked,
                                      }))
                                    }
                                    className="accent-brand-primary"
                                  />
                                  <span
                                    className={`text-[10px] font-mono transition-colors ${
                                      permsSource[p.key]
                                        ? "text-text-normal"
                                        : "text-text-muted"
                                    }`}
                                  >
                                    {p.label}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
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
