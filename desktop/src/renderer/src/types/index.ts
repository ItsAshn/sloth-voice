export type {
  SavedServer,
  User,
  Channel,
  Message,
  Member,
  Permission,
  CustomRole,
  VoicePeer,
  InviteCode,
  ServerSession,
} from "@sloth-voice/shared/types";

export interface SlothVoiceAPI {
  getServers: () => Promise<import("@sloth-voice/shared/types").SavedServer[]>;
  addServer: (
    server: Omit<import("@sloth-voice/shared/types").SavedServer, "id" | "addedAt">,
  ) => Promise<import("@sloth-voice/shared/types").SavedServer>;
  removeServer: (id: string) => Promise<void>;
  exportServers: () => Promise<string>;
  importServers: (json: string) => Promise<import("@sloth-voice/shared/types").SavedServer[]>;
  getVersion: () => Promise<string>;
  openExternal: (url: string) => Promise<void>;
  clearMentions?: (serverId: string) => Promise<void>;
  getMentionBadge?: (serverId: string) => Promise<number>;
}

declare global {
  interface Window {
    slothVoice: SlothVoiceAPI;
  }
}
