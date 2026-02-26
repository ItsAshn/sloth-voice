import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  SavedServer,
  User,
  Channel,
  Message,
  Member,
  ServerSession,
} from "../types";

const SERVERS_KEY = "sloth-voice:servers";

interface StoreState {
  savedServers: SavedServer[];
  loadServers: () => Promise<void>;
  addServer: (
    server: Omit<SavedServer, "id" | "addedAt">,
  ) => Promise<SavedServer>;
  removeServer: (id: string) => Promise<void>;
  importServers: (json: string) => Promise<SavedServer[]>;

  activeServer: SavedServer | null;
  setActiveServer: (server: SavedServer | null) => void;

  sessions: Record<string, ServerSession>;
  setSession: (serverId: string, session: ServerSession) => void;

  channels: Channel[];
  setChannels: (channels: Channel[]) => void;

  activeChannel: Channel | null;
  setActiveChannel: (channel: Channel | null) => void;

  messages: Message[];
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;

  members: Member[];
  setMembers: (members: Member[]) => void;
}

export const useStore = create<StoreState>((set, get) => ({
  savedServers: [],

  loadServers: async () => {
    try {
      const raw = await AsyncStorage.getItem(SERVERS_KEY);
      const servers: SavedServer[] = raw ? JSON.parse(raw) : [];
      set({ savedServers: servers });
    } catch {}
  },

  addServer: async (data) => {
    const server: SavedServer = {
      ...data,
      id: Date.now().toString(),
      addedAt: Date.now(),
    };
    const updated = [...get().savedServers, server];
    await AsyncStorage.setItem(SERVERS_KEY, JSON.stringify(updated));
    set({ savedServers: updated });
    return server;
  },

  removeServer: async (id) => {
    const updated = get().savedServers.filter((s) => s.id !== id);
    await AsyncStorage.setItem(SERVERS_KEY, JSON.stringify(updated));
    set({ savedServers: updated });
  },

  importServers: async (json: string) => {
    const incoming: SavedServer[] = JSON.parse(json);
    const existing = get().savedServers;
    const merged = [...existing];
    for (const s of incoming) {
      if (!merged.find((e) => e.url === s.url))
        merged.push({
          ...s,
          id: Date.now().toString() + Math.random(),
          addedAt: Date.now(),
        });
    }
    await AsyncStorage.setItem(SERVERS_KEY, JSON.stringify(merged));
    set({ savedServers: merged });
    return merged;
  },

  activeServer: null,
  setActiveServer: (server) =>
    set({
      activeServer: server,
      activeChannel: null,
      messages: [],
      channels: [],
    }),

  sessions: {},
  setSession: (serverId, session) =>
    set((s) => ({ sessions: { ...s.sessions, [serverId]: session } })),

  channels: [],
  setChannels: (channels) => set({ channels }),

  activeChannel: null,
  setActiveChannel: (channel) => set({ activeChannel: channel, messages: [] }),

  messages: [],
  setMessages: (messages) => set({ messages }),
  addMessage: (message) =>
    set((s) => {
      if (s.messages.some((m) => m.id === message.id)) return s;
      return { messages: [...s.messages, message] };
    }),

  members: [],
  setMembers: (members) => set({ members }),
}));
