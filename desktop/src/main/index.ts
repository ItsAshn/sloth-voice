import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  Notification,
  Tray,
  Menu,
  nativeImage,
  dialog,
} from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import updaterPkg from "electron-updater";
const { autoUpdater } = updaterPkg;
import Store from "electron-store";
import { io as ioClient, Socket } from "socket.io-client";

// Persistent server list store
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const store = new Store<{ servers: SavedServer[] }>({
  defaults: { servers: [] },
}) as any;

interface SavedServer {
  id: string;
  name: string;
  url: string;
  icon?: string;
  addedAt: number;
}

// ---------------------------------------------------------------------------
// Background notification socket manager
// One lightweight socket per saved server — lives in the main process so it
// persists even when the renderer window is hidden or minimised.
// ---------------------------------------------------------------------------

interface WatchedServer {
  id: string;
  name: string;
  url: string;
  token: string;
  userId?: string;
  socket: Socket;
}

// Per-server unread mention counts (persisted only in memory; renderer holds truth)
const mentionCounts = new Map<string, number>();

const watchedSockets = new Map<string, WatchedServer>();

function startWatching(
  serverId: string,
  serverName: string,
  serverUrl: string,
  token: string,
  userId?: string,
): void {
  // Already watching this server
  if (watchedSockets.has(serverId)) return;

  const socket = ioClient(serverUrl, {
    auth: { token },
    transports: ["websocket"],
    // Aggressive reconnection with exponential back-off keeps power low
    reconnectionDelay: 5000,
    reconnectionDelayMax: 60_000,
    randomizationFactor: 0.5,
  });

  socket.on("connect", () => {
    // Tell the server we want server-wide notifications (not tied to a channel)
    socket.emit("notification:subscribe");
    // Join per-user room so targeted @mentions are delivered
    if (userId) socket.emit("user:subscribe", { userId });
  });

  socket.on(
    "message:new",
    (msg: {
      author_username?: string;
      content?: string;
      channel_id?: string;
    }) => {
      // Only notify when the renderer window is not focused
      const focused = BrowserWindow.getAllWindows().some((w) => w.isFocused());
      if (!focused) {
        showNotification(
          serverName,
          msg.author_username ?? "Someone",
          msg.content ?? "New message",
        );
      }
      // Forward to renderer so the store stays current
      BrowserWindow.getAllWindows().forEach((w) =>
        w.webContents.send("bg:message:new", { serverId, message: msg }),
      );
    },
  );

  socket.on("server:announce", (data: { title?: string; body?: string }) => {
    showNotification(serverName, data.title ?? "Announcement", data.body ?? "");
    BrowserWindow.getAllWindows().forEach((w) =>
      w.webContents.send("bg:announce", { serverId, ...data }),
    );
  });

  socket.on("channel:created", (channel: unknown) => {
    BrowserWindow.getAllWindows().forEach((w) =>
      w.webContents.send("bg:channel:created", { serverId, channel }),
    );
  });

  socket.on("channel:deleted", (data: unknown) => {
    BrowserWindow.getAllWindows().forEach((w) =>
      w.webContents.send("bg:channel:deleted", { serverId, data }),
    );
  });

  socket.on(
    "message:mention",
    (data: {
      channel_id?: string;
      author_username?: string;
      content?: string;
      mention_type?: string;
      mentionedUserId?: string | null;
    }) => {
      // Increment in-memory badge count
      const prev = mentionCounts.get(serverId) ?? 0;
      mentionCounts.set(serverId, prev + 1);

      // Native OS notification
      const isPersonal = data.mention_type === "user";
      const notifTitle = isPersonal
        ? `${data.author_username ?? "Someone"} mentioned you`
        : `@${data.mention_type} mention`;
      showNotification(serverName, notifTitle, data.content ?? "");

      // Forward to renderer
      BrowserWindow.getAllWindows().forEach((w) =>
        w.webContents.send("bg:mention", {
          serverId,
          ...data,
          count: mentionCounts.get(serverId) ?? 1,
        }),
      );
    },
  );

  watchedSockets.set(serverId, {
    id: serverId,
    name: serverName,
    url: serverUrl,
    token,
    userId,
    socket,
  });
}

function stopWatching(serverId: string): void {
  const entry = watchedSockets.get(serverId);
  if (!entry) return;
  entry.socket.disconnect();
  watchedSockets.delete(serverId);
}

function updateWatchToken(
  serverId: string,
  token: string,
  userId?: string,
): void {
  const entry = watchedSockets.get(serverId);
  if (!entry) return;
  if (entry.token === token && (!userId || entry.userId === userId)) return;
  // Reconnect with new token / userId
  entry.socket.disconnect();
  watchedSockets.delete(serverId);
  startWatching(serverId, entry.name, entry.url, token, userId ?? entry.userId);
}

function clearMentions(serverId: string): void {
  mentionCounts.delete(serverId);
  BrowserWindow.getAllWindows().forEach((w) =>
    w.webContents.send("bg:mention:cleared", { serverId }),
  );
}

function showNotification(server: string, title: string, body: string): void {
  if (!Notification.isSupported()) return;
  new Notification({
    title: `${server} — ${title}`,
    body,
    silent: false,
  }).show();
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------

let tray: Tray | null = null;

function createTray(win: BrowserWindow): void {
  // Use a blank 1×1 image as default; replace with your icon asset if available
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip("Discard");

  const menu = Menu.buildFromTemplate([
    {
      label: "Show Discard",
      click: () => {
        win.show();
        win.focus();
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on("double-click", () => {
    win.show();
    win.focus();
  });
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 560,
    show: false,
    backgroundColor: "#050508",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      webSecurity: false, // allow connections to local servers
    },
  });

  win.on("ready-to-show", () => win.show());

  // Hide to tray instead of closing
  win.on("close", (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      win.hide();
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return win;
}

// ---------------------------------------------------------------------------
// Single-instance lock — prevent multiple copies of the app from running
// ---------------------------------------------------------------------------

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running; quit this one immediately.
  app.quit();
} else {
  // When a second launch is attempted, focus the existing window.
  app.on("second-instance", () => {
    const wins = BrowserWindow.getAllWindows();
    const win = wins.length > 0 ? wins[0] : createWindow();
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.discard.desktop");

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // IPC: Server list management (persisted via electron-store)
  ipcMain.handle("servers:get", () => store.get("servers"));

  ipcMain.handle("servers:add", (_e, server: SavedServer) => {
    const servers = store.get("servers") as SavedServer[];
    const existing = servers.findIndex((s) => s.id === server.id);
    if (existing >= 0) {
      servers[existing] = server;
    } else {
      servers.push(server);
    }
    store.set("servers", servers);
    return servers;
  });

  ipcMain.handle("servers:remove", (_e, serverId: string) => {
    const servers = (store.get("servers") as SavedServer[]).filter(
      (s) => s.id !== serverId,
    );
    store.set("servers", servers);
    stopWatching(serverId);
    return servers;
  });

  ipcMain.handle("servers:export", () => {
    return JSON.stringify(store.get("servers"), null, 2);
  });

  ipcMain.handle("servers:import", (_e, json: string) => {
    try {
      const incoming = JSON.parse(json) as SavedServer[];
      const existing = store.get("servers") as SavedServer[];
      const merged = [...existing];
      for (const s of incoming) {
        if (!merged.some((e) => e.id === s.id)) merged.push(s);
      }
      store.set("servers", merged);
      return { ok: true, servers: merged };
    } catch {
      return { ok: false, error: "Invalid server list JSON" };
    }
  });

  // IPC: Background notification socket management
  ipcMain.handle(
    "notifications:watch",
    (
      _e,
      {
        serverId,
        serverName,
        serverUrl,
        token,
        userId,
      }: {
        serverId: string;
        serverName: string;
        serverUrl: string;
        token: string;
        userId?: string;
      },
    ) => {
      startWatching(serverId, serverName, serverUrl, token, userId);
    },
  );

  ipcMain.handle("notifications:unwatch", (_e, serverId: string) => {
    stopWatching(serverId);
  });

  ipcMain.handle(
    "notifications:updateToken",
    (
      _e,
      {
        serverId,
        token,
        userId,
      }: { serverId: string; token: string; userId?: string },
    ) => {
      updateWatchToken(serverId, token, userId);
    },
  );

  // Badge / mention helpers
  ipcMain.handle("mentions:clear", (_e, serverId: string) => {
    clearMentions(serverId);
  });

  ipcMain.handle("mentions:getBadge", (_e, serverId: string) => {
    return mentionCounts.get(serverId) ?? 0;
  });

  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("open-external", (_e, url: string) => shell.openExternal(url));

  const mainWindow = createWindow();
  createTray(mainWindow);

  // Auto-updater (only runs in packaged builds)
  if (!is.dev) {
    autoUpdater.checkForUpdates();

    autoUpdater.on("update-available", () => {
      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "Update available",
        message:
          "A new version of Discard is available. It will be downloaded in the background.",
        buttons: ["OK"],
      });
    });

    autoUpdater.on("update-downloaded", () => {
      dialog
        .showMessageBox(mainWindow, {
          type: "info",
          title: "Update ready",
          message: "Update downloaded. Restart Discard to apply the update.",
          buttons: ["Restart now", "Later"],
        })
        .then(({ response }) => {
          if (response === 0) autoUpdater.quitAndInstall();
        });
    });

    autoUpdater.on("error", (err) => {
      console.error("Auto-updater error:", err);
    });
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow.show();
  });
});

// Extend app type to carry quit flag
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Electron {
    interface App {
      isQuiting?: boolean;
    }
  }
}

app.on("before-quit", () => {
  app.isQuiting = true;
  watchedSockets.forEach((w) => w.socket.disconnect());
});

app.on("window-all-closed", () => {
  // On macOS keep the app alive in the tray; on Windows/Linux also stay alive.
  // The user quits explicitly via the tray menu or Cmd+Q.
  if (process.platform !== "darwin") {
    // Do NOT quit — stay in tray for background notifications
  }
});
