import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useStore } from "../store/useStore";
import type { Channel, Message } from "../types";

export function useSocket(serverUrl: string, token: string | undefined) {
  const socketRef = useRef<Socket | null>(null);
  const addMessage = useStore((s) => s.addMessage);
  const setChannels = useStore((s) => s.setChannels);
  const activeChannel = useStore((s) => s.activeChannel);
  const sessions = useStore((s) => s.sessions);
  const activeServer = useStore((s) => s.activeServer);

  useEffect(() => {
    if (!serverUrl || !token) return;

    const socket = io(serverUrl, {
      auth: { token },
      transports: ["websocket"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      if (activeChannel) {
        socket.emit("channel:join", activeChannel.id);
      }
      // Join per-user mention room
      const userId = activeServer
        ? sessions[activeServer.id]?.user?.id
        : undefined;
      if (userId) {
        socket.emit("user:subscribe", { userId });
      }
    });

    socket.on("message:new", (message: Message) => {
      addMessage(message);
    });

    socket.on("channel:created", (channel: Channel) => {
      setChannels([...useStore.getState().channels, channel]);
    });

    socket.on("channel:deleted", ({ id }: { id: string }) => {
      setChannels(useStore.getState().channels.filter((c) => c.id !== id));
    });

    socket.on("connect_error", (err) => {
      console.error("Socket connection error:", err.message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverUrl, token]);

  // join/leave channels
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket?.connected || !activeChannel) return;
    socket.emit("channel:join", activeChannel.id);
  }, [activeChannel]);

  return socketRef;
}
