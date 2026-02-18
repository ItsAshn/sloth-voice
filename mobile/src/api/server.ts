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

export async function register(
  serverUrl: string,
  username: string,
  password: string,
  display_name?: string,
  serverPassword?: string,
) {
  const res = await axios.post(
    `${serverUrl.replace(/\/$/, "")}/api/auth/register`,
    {
      username,
      password,
      display_name: display_name || username,
      ...(serverPassword ? { serverPassword } : {}),
    },
  );
  return res.data as { token: string; user: User };
}

export async function login(
  serverUrl: string,
  username: string,
  password: string,
) {
  const res = await axios.post(
    `${serverUrl.replace(/\/$/, "")}/api/auth/login`,
    { username, password },
  );
  return res.data as { token: string; user: User };
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

export async function fetchChannels(): Promise<Channel[]> {
  const res = await client().get("/api/channels");
  return res.data.channels ?? res.data;
}

export async function fetchMessages(channelId: string): Promise<Message[]> {
  const res = await client().get(`/api/channels/${channelId}/messages`);
  return res.data.messages ?? res.data;
}

export async function sendMessage(
  channelId: string,
  content: string,
): Promise<Message> {
  return (
    await client().post(`/api/channels/${channelId}/messages`, { content })
  ).data;
}

export async function fetchMembers(): Promise<Member[]> {
  const res = await client().get("/api/auth/users");
  return res.data.users ?? res.data;
}
