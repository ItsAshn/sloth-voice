import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

interface SavedServer {
  id: string;
  name: string;
  url: string;
  icon?: string;
  addedAt: number;
}

const discardAPI = {
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
};

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld("electron", electronAPI);
  contextBridge.exposeInMainWorld("discard", discardAPI);
} else {
  // @ts-ignore
  window.electron = electronAPI;
  // @ts-ignore
  window.discard = discardAPI;
}

export type DiscardAPI = typeof discardAPI;
