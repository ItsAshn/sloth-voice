import { create } from "zustand";
import type {
  SavedServer,
  Channel,
  Message,
  Member,
  VoicePeer,
  ServerSession,
} from "../types";

interface StoreState {
  // server list (source of truth: electron-store via IPC)
  savedServers: SavedServer[];
  setSavedServers: (servers: SavedServer[]) => void;

  // active server context
  activeServer: SavedServer | null;
  setActiveServer: (server: SavedServer | null) => void;

  // per-server sessions (token + user keyed by serverId)
  sessions: Record<string, ServerSession>;
  setSession: (serverId: string, session: ServerSession) => void;
  clearSession: (serverId: string) => void;

  // channels
  channels: Channel[];
  setChannels: (channels: Channel[]) => void;

  // active channel
  activeChannel: Channel | null;
  setActiveChannel: (channel: Channel | null) => void;

  // messages
  messages: Message[];
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;

  // members (server member list)
  members: Member[];
  setMembers: (members: Member[]) => void;

  // mention badge counts — keyed by serverId
  mentionCounts: Record<string, number>;
  incrementMentions: (serverId: string, by?: number) => void;
  clearMentions: (serverId: string) => void;

  // voice
  activeVoiceChannel: Channel | null;
  setActiveVoiceChannel: (channel: Channel | null) => void;
  voicePeers: VoicePeer[];
  setVoicePeers: (peers: VoicePeer[]) => void;
  addVoicePeer: (peer: VoicePeer) => void;
  removeVoicePeer: (id: string) => void;
  updateVoicePeer: (id: string, patch: Partial<VoicePeer>) => void;
  localMuted: boolean;
  setLocalMuted: (muted: boolean) => void;
  localSpeaking: boolean;
  setLocalSpeaking: (speaking: boolean) => void;
}

export const useStore = create<StoreState>((set) => ({
  savedServers: [],
  setSavedServers: (servers) => set({ savedServers: servers }),

  activeServer: null,
  setActiveServer: (server) =>
    set({
      activeServer: server,
      activeChannel: null,
      messages: [],
      channels: [],
      voicePeers: [],
    }),

  sessions: {},
  setSession: (serverId, session) =>
    set((s) => ({ sessions: { ...s.sessions, [serverId]: session } })),
  clearSession: (serverId) =>
    set((s) => {
      const { [serverId]: _, ...rest } = s.sessions;
      return { sessions: rest };
    }),

  channels: [],
  setChannels: (channels) => set({ channels }),

  activeChannel: null,
  setActiveChannel: (channel) => set({ activeChannel: channel, messages: [] }),

  messages: [],
  setMessages: (messages) => set({ messages }),
  addMessage: (message) =>
    set((s) => ({
      messages: s.messages.some((m) => m.id === message.id)
        ? s.messages
        : [...s.messages, message],
    })),

  members: [],
  setMembers: (members) => set({ members }),

  mentionCounts: {},
  incrementMentions: (serverId, by = 1) =>
    set((s) => ({
      mentionCounts: {
        ...s.mentionCounts,
        [serverId]: (s.mentionCounts[serverId] ?? 0) + by,
      },
    })),
  clearMentions: (serverId) =>
    set((s) => {
      const { [serverId]: _, ...rest } = s.mentionCounts;
      return { mentionCounts: rest };
    }),

  activeVoiceChannel: null,
  setActiveVoiceChannel: (channel) => set({ activeVoiceChannel: channel }),

  voicePeers: [],
  setVoicePeers: (peers) => set({ voicePeers: peers }),
  addVoicePeer: (peer) => set((s) => ({ voicePeers: [...s.voicePeers, peer] })),
  removeVoicePeer: (id) =>
    set((s) => ({ voicePeers: s.voicePeers.filter((p) => p.id !== id) })),
  updateVoicePeer: (id, patch) =>
    set((s) => ({
      voicePeers: s.voicePeers.map((p) =>
        p.id === id ? { ...p, ...patch } : p,
      ),
    })),

  localMuted: false,
  setLocalMuted: (muted) => set({ localMuted: muted }),
  localSpeaking: false,
  setLocalSpeaking: (speaking) => set({ localSpeaking: speaking }),
}));
