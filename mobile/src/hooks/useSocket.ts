import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useStore } from "../store/useStore";
import type { Message } from "../types";

export function useSocket(serverUrl: string, token: string | undefined) {
  const socketRef = useRef<Socket | null>(null);
  const addMessage = useStore((s) => s.addMessage);
  const activeChannel = useStore((s) => s.activeChannel);

  useEffect(() => {
    if (!serverUrl || !token) return;
    const socket = io(serverUrl, {
      auth: { token },
      transports: ["websocket"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      if (activeChannel) socket.emit("channel:join", activeChannel.id);
    });

    socket.on("message:new", (msg: Message) => addMessage(msg));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [serverUrl, token]);

  useEffect(() => {
    const s = socketRef.current;
    if (!s?.connected || !activeChannel) return;
    s.emit("channel:join", activeChannel.id);
  }, [activeChannel]);

  return socketRef;
}
