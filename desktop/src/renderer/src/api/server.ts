import axios from "axios";
import type { User, Channel, Message, Member } from "../types";

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
  );
  return res.data as {
    name: string;
    description: string;
    passwordProtected: boolean;
  };
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
): Promise<{ name: string }> {
  const res = await client().patch("/api/server/settings", { name });
  return res.data;
}
