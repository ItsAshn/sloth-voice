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
}

export interface ServerSession {
  serverId: string;
  token: string;
  user: User;
}
