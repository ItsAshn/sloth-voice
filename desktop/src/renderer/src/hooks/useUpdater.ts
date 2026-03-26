import { useEffect, useCallback } from "react";
import { useStore } from "../store/useStore";

interface UpdaterBridge {
  checkForUpdates(): Promise<{ checking: boolean; updateInfo?: unknown; error?: string }>;
  installUpdate(): Promise<void>;
  getUpdaterState(): Promise<{ isDev: boolean; version: string }>;
  onUpdaterChecking(cb: () => void): () => void;
  onUpdaterAvailable(cb: (info: { version: string }) => void): () => void;
  onUpdaterNotAvailable(cb: () => void): () => void;
  onUpdaterProgress(cb: (progress: { percent: number; transferred: number; total: number }) => void): () => void;
  onUpdaterDownloaded(cb: (info: { version: string }) => void): () => void;
  onUpdaterError(cb: (err: { message: string }) => void): () => void;
}

function getBridge(): UpdaterBridge | null {
  return (window as unknown as { slothVoice?: UpdaterBridge }).slothVoice ?? null;
}

export function useUpdater(): void {
  const setUpdateState = useStore((s) => s.setUpdateState);
  const setUpdateProgress = useStore((s) => s.setUpdateProgress);
  const setUpdateVersion = useStore((s) => s.setUpdateVersion);
  const setUpdateError = useStore((s) => s.setUpdateError);

  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;

    const unsubChecking = bridge.onUpdaterChecking(() => {
      setUpdateState("checking");
      setUpdateError(null);
    });

    const unsubAvailable = bridge.onUpdaterAvailable(({ version }) => {
      setUpdateState("downloading");
      setUpdateVersion(version);
      setUpdateProgress(0);
    });

    const unsubNotAvailable = bridge.onUpdaterNotAvailable(() => {
      setUpdateState("idle");
    });

    const unsubProgress = bridge.onUpdaterProgress(({ percent }) => {
      setUpdateProgress(percent);
    });

    const unsubDownloaded = bridge.onUpdaterDownloaded(({ version }) => {
      setUpdateState("ready");
      setUpdateVersion(version);
      setUpdateProgress(100);
    });

    const unsubError = bridge.onUpdaterError(({ message }) => {
      setUpdateState("error");
      setUpdateError(message);
    });

    return () => {
      unsubChecking();
      unsubAvailable();
      unsubNotAvailable();
      unsubProgress();
      unsubDownloaded();
      unsubError();
    };
  }, [setUpdateState, setUpdateProgress, setUpdateVersion, setUpdateError]);
}

export function useUpdaterActions() {
  const bridge = getBridge();

  const checkForUpdates = useCallback(async () => {
    if (!bridge) return { error: "Not running in Electron" };
    try {
      const result = await bridge.checkForUpdates();
      return result;
    } catch (err) {
      return { error: String(err) };
    }
  }, [bridge]);

  const installUpdate = useCallback(async () => {
    if (!bridge) return;
    await bridge.installUpdate();
  }, [bridge]);

  const getVersion = useCallback(async () => {
    if (!bridge) return null;
    const state = await bridge.getUpdaterState();
    return state.version;
  }, [bridge]);

  const isDev = useCallback(async () => {
    if (!bridge) return true;
    const state = await bridge.getUpdaterState();
    return state.isDev;
  }, [bridge]);

  return { checkForUpdates, installUpdate, getVersion, isDev };
}