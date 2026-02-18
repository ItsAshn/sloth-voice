import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { useStore } from "./store/useStore";
import AppLayout from "./components/Layout/AppLayout";
import HomePage from "./components/Home/HomePage";
import { useBackgroundNotifications } from "./hooks/useBackgroundNotifications";

export default function App() {
  const setSavedServers = useStore((s) => s.setSavedServers);

  useEffect(() => {
    window.discard?.getServers().then(setSavedServers).catch(console.error);
  }, [setSavedServers]);

  // Keep background notification sockets alive in the main process
  useBackgroundNotifications();

  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="server/:serverId" element={<HomePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
