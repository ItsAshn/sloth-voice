import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  SavedServer,
  Channel,
  Message,
  Member,
  VoicePeer,
  ServerSession,
} from "../types";

interface DMChannel {
  id: string;
  other_user_id: string;
  other_username: string;
  other_display_name: string;
  other_avatar: string | null;
  created_at: number;
  last_message_at: number | null;
}

interface StoreState {
  // server list (source of truth: electron-store via IPC)
  savedServers: SavedServer[];
  setSavedServers: (servers: SavedServer[]) => void;

  // active server context
  activeServer: SavedServer | null;
  setActiveServer: (server: SavedServer | null) => void;
  updateActiveServerName: (name: string) => void;
  updateServerIcon: (serverId: string, icon: string | null) => void;

  // per-server sessions (token + user keyed by serverId)
  sessions: Record<string, ServerSession>;
  setSession: (serverId: string, session: ServerSession) => void;
  clearSession: (serverId: string) => void;
  updateSessionUser: (
    serverId: string,
    patch: Partial<import("../types").User>,
  ) => void;

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
  localConnectionQuality: "good" | "fair" | "poor" | null;
  setLocalConnectionQuality: (quality: "good" | "fair" | "poor" | null) => void;
  /** Client-preferred audio bitrate in kbps (e.g. 32, 64, 96, 128) */
  audioBitrateKbps: number;
  setAudioBitrateKbps: (kbps: number) => void;
  audioInputDeviceId: string | null;
  setAudioInputDeviceId: (id: string | null) => void;
  audioOutputDeviceId: string | null;
  setAudioOutputDeviceId: (id: string | null) => void;
  /** Voice connection error message, if any */
  voiceError: string | null;
  setVoiceError: (error: string | null) => void;

  // auto-updater state
  updateState: "idle" | "checking" | "downloading" | "ready" | "error";
  setUpdateState: (state: "idle" | "checking" | "downloading" | "ready" | "error") => void;
  updateProgress: number;
  setUpdateProgress: (progress: number) => void;
  updateVersion: string | null;
  setUpdateVersion: (version: string | null) => void;
  updateError: string | null;
  setUpdateError: (error: string | null) => void;

  // direct messages
  dmChannels: DMChannel[];
  setDMChannels: (channels: DMChannel[]) => void;
  activeDMChannel: DMChannel | null;
  setActiveDMChannel: (channel: DMChannel | null) => void;
  dmMessages: Message[];
  setDMMessages: (messages: Message[]) => void;
  addDMMessage: (message: Message) => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
      savedServers: [],
      setSavedServers: (servers) => set({ savedServers: servers }),

      activeServer: null,
      setActiveServer: (server) =>
        set({
          activeServer: server,
          activeChannel: null,
          activeVoiceChannel: null,
          messages: [],
          channels: [],
          voicePeers: [],
        }),
      updateActiveServerName: (name) =>
        set((s) => {
          if (!s.activeServer) return {};
          const updated = { ...s.activeServer, name };
          return {
            activeServer: updated,
            savedServers: s.savedServers.map((sv) =>
              sv.id === updated.id ? updated : sv,
            ),
          };
        }),
      updateServerIcon: (serverId, icon) =>
        set((s) => ({
          savedServers: s.savedServers.map((sv) =>
            sv.id === serverId ? { ...sv, icon: icon ?? undefined } : sv,
          ),
          activeServer:
            s.activeServer?.id === serverId
              ? { ...s.activeServer, icon: icon ?? undefined }
              : s.activeServer,
        })),

      sessions: {},
      setSession: (serverId, session) =>
        set((s) => ({ sessions: { ...s.sessions, [serverId]: session } })),
      clearSession: (serverId) =>
        set((s) => {
          const { [serverId]: _, ...rest } = s.sessions;
          return { sessions: rest };
        }),
      updateSessionUser: (serverId, patch) =>
        set((s) => {
          const existing = s.sessions[serverId];
          if (!existing) return {};
          return {
            sessions: {
              ...s.sessions,
              [serverId]: { ...existing, user: { ...existing.user, ...patch } },
            },
          };
        }),

      channels: [],
      setChannels: (channels) => set({ channels }),

      activeChannel: null,
      setActiveChannel: (channel) =>
        set({ activeChannel: channel, messages: [] }),

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
      addVoicePeer: (peer) =>
        set((s) => ({ voicePeers: [...s.voicePeers, peer] })),
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
      localConnectionQuality: null,
      setLocalConnectionQuality: (quality) =>
        set({ localConnectionQuality: quality }),
      audioBitrateKbps: 64,
      setAudioBitrateKbps: (kbps) => set({ audioBitrateKbps: kbps }),
      audioInputDeviceId: null,
      setAudioInputDeviceId: (id) => set({ audioInputDeviceId: id }),
      audioOutputDeviceId: null,
      setAudioOutputDeviceId: (id) => set({ audioOutputDeviceId: id }),
      voiceError: null,
      setVoiceError: (error) => set({ voiceError: error }),

      updateState: "idle",
      setUpdateState: (state) => set({ updateState: state }),
      updateProgress: 0,
      setUpdateProgress: (progress) => set({ updateProgress: progress }),
      updateVersion: null,
      setUpdateVersion: (version) => set({ updateVersion: version }),
      updateError: null,
      setUpdateError: (error) => set({ updateError: error }),

      dmChannels: [],
      setDMChannels: (channels) => set({ dmChannels: channels }),
      activeDMChannel: null,
      setActiveDMChannel: (channel) =>
        set({ activeDMChannel: channel, dmMessages: [] }),
      dmMessages: [],
      setDMMessages: (messages) => set({ dmMessages: messages }),
      addDMMessage: (message) =>
        set((s) => ({
          dmMessages: s.dmMessages.some((m) => m.id === message.id)
            ? s.dmMessages
            : [...s.dmMessages, message],
        })),
    }),
    {
      name: "sloth-voice-saved-servers",
      // Persist the server list and per-server login sessions
      partialize: (state) => ({
        savedServers: state.savedServers,
        sessions: state.sessions,
        audioInputDeviceId: state.audioInputDeviceId,
        audioOutputDeviceId: state.audioOutputDeviceId,
        audioBitrateKbps: state.audioBitrateKbps,
      }),
    },
  ),
);