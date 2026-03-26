import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

interface SavedServer {
  id: string;
  name: string;
  url: string;
  icon?: string;
  addedAt: number;
}

const slothVoiceAPI = {
  // Server list — persisted in electron-store
  getServers: (): Promise<SavedServer[]> => ipcRenderer.invoke("servers:get"),
  addServer: (server: SavedServer): Promise<SavedServer[]> =>
    ipcRenderer.invoke("servers:add", server),
  removeServer: (id: string): Promise<SavedServer[]> =>
    ipcRenderer.invoke("servers:remove", id),
  exportServers: (): Promise<string> => ipcRenderer.invoke("servers:export"),
  importServers: (
    json: string,
  ): Promise<{ ok: boolean; servers?: SavedServer[]; error?: string }> =>
    ipcRenderer.invoke("servers:import", json),

  // Background notification sockets (managed in the main process)
  watchServer: (args: {
    serverId: string;
    serverName: string;
    serverUrl: string;
    token: string;
    userId?: string;
  }): Promise<void> => ipcRenderer.invoke("notifications:watch", args),
  unwatchServer: (serverId: string): Promise<void> =>
    ipcRenderer.invoke("notifications:unwatch", serverId),
  updateWatchToken: (args: {
    serverId: string;
    token: string;
    userId?: string;
  }): Promise<void> => ipcRenderer.invoke("notifications:updateToken", args),

  // Listen for events forwarded from background sockets
  onBgMessage: (
    cb: (payload: { serverId: string; message: unknown }) => void,
  ) => {
    ipcRenderer.on("bg:message:new", (_e, payload) => cb(payload));
    return () => ipcRenderer.removeAllListeners("bg:message:new");
  },
  onBgAnnounce: (
    cb: (payload: { serverId: string; title: string; body: string }) => void,
  ) => {
    ipcRenderer.on("bg:announce", (_e, payload) => cb(payload));
    return () => ipcRenderer.removeAllListeners("bg:announce");
  },
  onBgChannelCreated: (
    cb: (payload: { serverId: string; channel: unknown }) => void,
  ) => {
    ipcRenderer.on("bg:channel:created", (_e, payload) => cb(payload));
    return () => ipcRenderer.removeAllListeners("bg:channel:created");
  },
  onBgChannelDeleted: (
    cb: (payload: { serverId: string; data: unknown }) => void,
  ) => {
    ipcRenderer.on("bg:channel:deleted", (_e, payload) => cb(payload));
    return () => ipcRenderer.removeAllListeners("bg:channel:deleted");
  },

  // Mention badge
  onBgMention: (
    cb: (payload: {
      serverId: string;
      channel_id?: string;
      author_username?: string;
      content?: string;
      mention_type?: string;
      mentionedUserId?: string | null;
      count: number;
    }) => void,
  ) => {
    ipcRenderer.on("bg:mention", (_e, payload) => cb(payload));
    return () => ipcRenderer.removeAllListeners("bg:mention");
  },
  onBgMentionCleared: (cb: (payload: { serverId: string }) => void) => {
    ipcRenderer.on("bg:mention:cleared", (_e, payload) => cb(payload));
    return () => ipcRenderer.removeAllListeners("bg:mention:cleared");
  },
  clearMentions: (serverId: string): Promise<void> =>
    ipcRenderer.invoke("mentions:clear", serverId),
  getMentionBadge: (serverId: string): Promise<number> =>
    ipcRenderer.invoke("mentions:getBadge", serverId),

  // App info
  getVersion: (): Promise<string> => ipcRenderer.invoke("app:version"),
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke("open-external", url),

  // Auto-updater
  checkForUpdates: (): Promise<{ checking: boolean; updateInfo?: unknown; error?: string }> =>
    ipcRenderer.invoke("updater:check"),
  installUpdate: (): Promise<void> => ipcRenderer.invoke("updater:install"),
  getUpdaterState: (): Promise<{ isDev: boolean; version: string }> =>
    ipcRenderer.invoke("updater:getState"),
  onUpdaterChecking: (cb: () => void) => {
    ipcRenderer.on("updater:checking", () => cb());
    return () => ipcRenderer.removeAllListeners("updater:checking");
  },
  onUpdaterAvailable: (
    cb: (info: { version: string }) => void,
  ) => {
    ipcRenderer.on("updater:available", (_e, info) => cb(info));
    return () => ipcRenderer.removeAllListeners("updater:available");
  },
  onUpdaterNotAvailable: (cb: () => void) => {
    ipcRenderer.on("updater:not-available", () => cb());
    return () => ipcRenderer.removeAllListeners("updater:not-available");
  },
  onUpdaterProgress: (
    cb: (progress: { percent: number; transferred: number; total: number }) => void,
  ) => {
    ipcRenderer.on("updater:progress", (_e, progress) => cb(progress));
    return () => ipcRenderer.removeAllListeners("updater:progress");
  },
  onUpdaterDownloaded: (
    cb: (info: { version: string }) => void,
  ) => {
    ipcRenderer.on("updater:downloaded", (_e, info) => cb(info));
    return () => ipcRenderer.removeAllListeners("updater:downloaded");
  },
  onUpdaterError: (cb: (err: { message: string }) => void) => {
    ipcRenderer.on("updater:error", (_e, err) => cb(err));
    return () => ipcRenderer.removeAllListeners("updater:error");
  },

  // Deep links (invite links)
  getPendingDeepLink: (): Promise<{
    serverUrl: string;
    inviteCode: string;
  } | null> => ipcRenderer.invoke("deep-link:getPending"),
  clearPendingDeepLink: (): Promise<void> =>
    ipcRenderer.invoke("deep-link:clear"),
  onDeepLinkInvite: (
    cb: (payload: { serverUrl: string; inviteCode: string }) => void,
  ) => {
    ipcRenderer.on("deep-link:invite", (_e, payload) => cb(payload));
    return () => ipcRenderer.removeAllListeners("deep-link:invite");
  },
};

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld("electron", electronAPI);
  contextBridge.exposeInMainWorld("slothVoice", slothVoiceAPI);
} else {
  // @ts-ignore
  window.electron = electronAPI;
  // @ts-ignore
  window.slothVoice = slothVoiceAPI;
}

export type SlothVoiceAPI = typeof slothVoiceAPI;
