export interface SavedServer {
  id: string;
  name: string;
  url: string;
  icon?: string;
  addedAt: number;
}

export interface User {
  id: string;
  username: string;
  display_name: string;
  avatar?: string;
  created_at: number;
  role?: "admin" | "member";
}

export interface Channel {
  id: string;
  name: string;
  type: "text" | "voice";
  position: number;
  created_at: number;
}

export interface Message {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  created_at: number;
  username?: string;
  display_name?: string;
}

export interface Member {
  id: string;
  username: string;
  display_name: string;
  avatar?: string;
  role?: "admin" | "member";
  custom_role_id?: string | null;
  custom_role_name?: string | null;
  custom_role_color?: string | null;
}

export type Permission =
  | "send_messages"
  | "manage_channels"
  | "delete_messages"
  | "kick_members"
  | "manage_invites";

export interface CustomRole {
  id: string;
  name: string;
  color: string;
  permissions: Partial<Record<Permission, boolean>>;
  created_at?: number;
}

export interface VoicePeer {
  id: string;
  userId: string;
  username: string;
  speaking: boolean;
  muted: boolean;
  connectionQuality?: "good" | "fair" | "poor";
}

export interface InviteCode {
  code: string;
  created_by?: string;
  max_uses: number | null;
  uses: number;
  expires_at: number | null; // unix seconds
  created_at?: number;
}

export interface ServerSession {
  serverId: string;
  token: string;
  user: User;
}
