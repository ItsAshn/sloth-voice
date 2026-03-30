import axios from "axios";
import type {
  User,
  Channel,
  Message,
  Member,
  InviteCode,
  CustomRole,
  Permission,
} from "./types";

let _baseUrl = "";
let _token = "";

export function configureApi(baseUrl: string, token: string) {
  _baseUrl = baseUrl.replace(/\/$/, "");
  _token = token;
}

function client() {
  return axios.create({
    baseURL: _baseUrl,
    headers: _token ? { Authorization: `Bearer ${_token}` } : {},
  });
}

// Auth
export async function register(
  serverUrl: string,
  username: string,
  password: string,
  display_name?: string,
  serverPassword?: string,
): Promise<{ token: string; user: User }> {
  const res = await axios.post(
    `${serverUrl.replace(/\/$/, "")}/api/auth/register`,
    {
      username,
      password,
      display_name: display_name || username,
      ...(serverPassword ? { serverPassword } : {}),
    },
  );
  return res.data;
}

export async function login(
  serverUrl: string,
  username: string,
  password: string,
): Promise<{ token: string; user: User }> {
  const res = await axios.post(
    `${serverUrl.replace(/\/$/, "")}/api/auth/login`,
    {
      username,
      password,
    },
  );
  return res.data;
}

export async function getMe(serverUrl: string, token: string): Promise<User> {
  const res = await axios.get(`${serverUrl.replace(/\/$/, "")}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

export async function fetchServerInfo(serverUrl: string) {
  const res = await axios.get(
    `${serverUrl.replace(/\/$/, "")}/api/server/info`,
    { timeout: 8000 },
  );
  return res.data as {
    name: string;
    description: string;
    passwordProtected: boolean;
    icon: string | null;
  };
}

export async function resolveInviteCode(
  code: string,
): Promise<{ serverUrl: string; name: string; description: string }> {
  const parts = code.toUpperCase().split(".");
  if (parts.length !== 2) {
    throw new Error("Invalid invite code format");
  }
  const [encodedUrl] = parts;
  let serverUrl: string;
  try {
    serverUrl = atob(encodedUrl.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    throw new Error("Invalid invite code format");
  }
  const res = await axios.get(
    `${serverUrl.replace(/\/$/, "")}/api/server/resolve/${code.toUpperCase()}`,
    { timeout: 8000 },
  );
  return res.data;
}

// Channels
export async function fetchChannels(): Promise<Channel[]> {
  const res = await client().get("/api/channels");
  return res.data.channels ?? res.data;
}

export async function createChannel(
  name: string,
  type: "text" | "voice",
): Promise<Channel> {
  const res = await client().post("/api/channels", { name, type });
  return res.data.channel ?? res.data;
}

export async function deleteChannel(id: string): Promise<void> {
  await client().delete(`/api/channels/${id}`);
}

// Messages
export async function fetchMessages(
  channelId: string,
  limit = 50,
): Promise<Message[]> {
  const res = await client().get(`/api/messages/${channelId}`, {
    params: { limit },
  });
  return res.data.messages ?? res.data;
}

export async function sendMessage(
  channelId: string,
  content: string,
): Promise<Message> {
  const res = await client().post(`/api/messages/${channelId}`, { content });
  return res.data.message ?? res.data;
}

export async function deleteMessage(messageId: string): Promise<void> {
  await client().delete(`/api/messages/${messageId}`);
}

// Members
export async function fetchMembers(): Promise<Member[]> {
  const res = await client().get("/api/auth/users");
  return res.data.users ?? res.data;
}

// Profile
export async function updateProfile(
  display_name?: string,
  avatar?: string | null,
): Promise<User> {
  const res = await client().patch("/api/auth/profile", {
    display_name,
    avatar,
  });
  return res.data.user ?? res.data;
}

// Server settings (admin)
export async function updateServerSettings(
  name: string,
  icon?: string | null,
): Promise<{ name: string; icon: string | null }> {
  const res = await client().patch("/api/server/settings", { name, icon });
  return res.data;
}

// Invite codes (admin)
export async function createInvite(
  maxUses?: number,
  expiresInHours?: number,
): Promise<InviteCode> {
  const res = await client().post("/api/server/invites", {
    maxUses: maxUses || null,
    expiresInHours: expiresInHours || null,
  });
  return res.data;
}

export async function fetchInvites(): Promise<InviteCode[]> {
  const res = await client().get("/api/server/invites");
  return res.data.invites ?? res.data;
}

export async function revokeInvite(code: string): Promise<void> {
  await client().delete(`/api/server/invites/${code}`);
}

// Member management (admin)
export async function setMemberRole(
  userId: string,
  role: "admin" | "member",
): Promise<void> {
  await client().patch(`/api/server/members/${userId}/role`, { role });
}

export async function kickMember(userId: string): Promise<void> {
  await client().delete(`/api/server/members/${userId}`);
}

export async function assignCustomRole(
  userId: string,
  roleId: string | null,
): Promise<void> {
  await client().patch(`/api/server/members/${userId}/custom-role`, { roleId });
}

// Custom roles (admin)
export async function fetchRoles(): Promise<CustomRole[]> {
  const res = await client().get("/api/roles");
  return res.data.roles ?? res.data;
}

export async function createRole(
  name: string,
  color: string,
  permissions: Partial<Record<Permission, boolean>>,
): Promise<CustomRole> {
  const res = await client().post("/api/roles", { name, color, permissions });
  return res.data.role ?? res.data;
}

export async function updateRole(
  id: string,
  name: string,
  color: string,
  permissions: Partial<Record<Permission, boolean>>,
): Promise<CustomRole> {
  const res = await client().patch(`/api/roles/${id}`, {
    name,
    color,
    permissions,
  });
  return res.data.role ?? res.data;
}

export async function deleteRole(id: string): Promise<void> {
  await client().delete(`/api/roles/${id}`);
}

// Invite join (for existing users)
export async function joinWithInvite(
  serverUrl: string,
  code: string,
): Promise<{ ok: boolean; alreadyMember: boolean }> {
  const res = await axios.post(
    `${serverUrl.replace(/\/$/, "")}/api/server/join/${code.toUpperCase()}`,
    {},
    _token ? { headers: { Authorization: `Bearer ${_token}` } } : {},
  );
  return res.data;
}

// Direct Messages
export async function fetchDMChannels(): Promise<DMChannel[]> {
  const res = await client().get("/api/dms");
  return res.data.channels ?? res.data;
}

export async function getOrCreateDMChannel(
  userId: string,
): Promise<DMChannel> {
  const res = await client().get(`/api/dms/${userId}`);
  return res.data.channel;
}

export async function fetchDMMessages(
  channelId: string,
  limit = 50,
): Promise<Message[]> {
  const res = await client().get(`/api/dms/channel/${channelId}/messages`, {
    params: { limit },
  });
  return res.data.messages ?? res.data;
}

export async function sendDMMessage(
  channelId: string,
  content: string,
): Promise<Message> {
  const res = await client().post(
    `/api/dms/channel/${channelId}/messages`,
    { content },
  );
  return res.data.message ?? res.data;
}

// Attachments (file uploads)
export async function uploadAttachment(
  channelId: string,
  file: File,
): Promise<FileAttachment> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${_baseUrl}/api/attachments/${channelId}`, {
    method: "POST",
    headers: _token ? { Authorization: `Bearer ${_token}` } : {},
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Upload failed" }));
    throw new Error(error.error || "Upload failed");
  }

  const data = await response.json();
  return data.attachment;
}

export async function fetchAttachments(messageId: string): Promise<FileAttachment[]> {
  const res = await client().get(`/api/attachments/message/${messageId}`);
  return res.data.attachments ?? res.data;
}

interface DMChannel {
  id: string;
  other_user_id: string;
  other_username: string;
  other_display_name: string;
  other_avatar: string | null;
  created_at: number;
  last_message_at: number | null;
}

interface FileAttachment {
  id: string;
  message_id: string;
  filename: string;
  url: string;
  size: number;
  content_type?: string;
  created_at: number;
}
