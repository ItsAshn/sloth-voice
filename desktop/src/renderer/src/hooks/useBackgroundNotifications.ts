/**
 * useBackgroundNotifications
 *
 * Registers a persistent, low-power Socket.IO connection in the Electron main
 * process for every server the user has a valid session for.
 *
 * - The socket lives in the main process so it keeps running even when the
 *   renderer window is hidden or minimised.
 * - Native OS notifications are shown by the main process when a message or
 *   announcement arrives while the window is not focused.
 * - Background messages are forwarded back to the renderer so the Zustand
 *   store stays up-to-date.
 */

import { useEffect } from "react";
import { useStore } from "../store/useStore";
import { useStoreHydrated } from "./useStoreHydrated";
import type { Message, Channel } from "../types";

// Minimal inline type for the background-notification bridge
interface SlothVoiceNotificationBridge {
  watchServer(args: {
    serverId: string;
    serverName: string;
    serverUrl: string;
    token: string;
    userId?: string;
  }): Promise<void>;
  unwatchServer(serverId: string): Promise<void>;
  updateWatchToken(args: {
    serverId: string;
    token: string;
    userId?: string;
  }): Promise<void>;
  onBgMessage(
    cb: (payload: { serverId: string; message: unknown }) => void,
  ): () => void;
  onBgAnnounce(
    cb: (payload: { serverId: string; title: string; body: string }) => void,
  ): () => void;
  onBgChannelCreated(
    cb: (payload: { serverId: string; channel: unknown }) => void,
  ): () => void;
  onBgChannelDeleted(
    cb: (payload: { serverId: string; data: unknown }) => void,
  ): () => void;
  onBgMention(
    cb: (payload: {
      serverId: string;
      channel_id?: string;
      author_username?: string;
      mention_type?: string;
      count: number;
    }) => void,
  ): () => void;
  onBgMentionCleared(cb: (payload: { serverId: string }) => void): () => void;
  clearMentions?(serverId: string): Promise<void>;
}

/** Guard: returns the bridge only when running inside Electron. */
function getBridge(): SlothVoiceNotificationBridge | null {
  return (
    (window as unknown as { slothVoice?: SlothVoiceNotificationBridge })
      .slothVoice ?? null
  );
}

export function useBackgroundNotifications(): void {
  const savedServers = useStore((s) => s.savedServers);
  const sessions = useStore((s) => s.sessions);
  const addMessage = useStore((s) => s.addMessage);
  const setChannels = useStore((s) => s.setChannels);
  const channels = useStore((s) => s.channels);
  const activeServer = useStore((s) => s.activeServer);
  const incrementMentions = useStore((s) => s.incrementMentions);
  const clearMentions = useStore((s) => s.clearMentions);
  const hydrated = useStoreHydrated();

  // Start / update watchers once the store is hydrated and whenever
  // the saved server list or sessions subsequently change
  useEffect(() => {
    if (!hydrated) return; // wait for localStorage sessions to load
    const bridge = getBridge();
    if (!bridge) return;
    savedServers.forEach((server) => {
      const session = sessions[server.id];
      if (!session?.token) return;

      bridge
        .watchServer({
          serverId: server.id,
          serverName: server.name,
          serverUrl: server.url,
          token: session.token,
          userId: session.user.id,
        })
        .catch(() => {
          /* main process will log errors */
        });
    });
  }, [hydrated, savedServers, sessions]);

  // Keep tokens / userIds fresh when sessions change
  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;
    Object.entries(sessions).forEach(([serverId, session]) => {
      if (!session?.token) return;
      bridge
        .updateWatchToken({
          serverId,
          token: session.token,
          userId: session.user.id,
        })
        .catch(() => {});
    });
  }, [sessions]);

  // Listen for background messages forwarded from the main process
  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;

    const offMessage = bridge.onBgMessage(({ serverId, message }) => {
      if (activeServer?.id === serverId) {
        addMessage(message as Message);
      }
    });

    const offChannel = bridge.onBgChannelCreated(({ serverId, channel }) => {
      if (activeServer?.id === serverId) {
        setChannels([...channels, channel as Channel]);
      }
    });

    const offChannelDel = bridge.onBgChannelDeleted(({ serverId, data }) => {
      if (activeServer?.id === serverId) {
        const { id } = data as { id: string };
        setChannels(channels.filter((c) => c.id !== id));
      }
    });

    const offMention = bridge.onBgMention(({ serverId }) => {
      // Only increment badge if the user is NOT already looking at that server
      if (activeServer?.id !== serverId) {
        incrementMentions(serverId);
      }
    });

    const offMentionCleared = bridge.onBgMentionCleared(({ serverId }) => {
      clearMentions(serverId);
    });

    return () => {
      offMessage();
      offChannel();
      offChannelDel();
      offMention();
      offMentionCleared();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeServer, channels]);
}
