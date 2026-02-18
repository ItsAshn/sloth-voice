import { Outlet } from "react-router-dom";
import ServerList from "../Sidebar/ServerList";
import ChannelList from "../Sidebar/ChannelList";
import MembersList from "../Members/MembersList";
import VoiceChannel from "../Voice/VoiceChannel";
import { useStore } from "../../store/useStore";

export default function AppLayout() {
  const activeServer = useStore((s) => s.activeServer);

  return (
    <div className="flex h-full w-full bg-surface-high text-text-normal select-none font-mono">
      {/* Server rail */}
      <ServerList />

      {/* Channel sidebar + voice panel */}
      {activeServer && (
        <div className="flex flex-col w-56 shrink-0">
          <ChannelList />
          <VoiceChannel />
        </div>
      )}

      {/* Main content */}
      <main className="flex flex-1 overflow-hidden">
        <Outlet />
      </main>

      {/* Members sidebar */}
      {activeServer && <MembersList />}
    </div>
  );
}
