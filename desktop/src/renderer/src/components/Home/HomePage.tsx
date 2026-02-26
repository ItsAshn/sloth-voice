import { useStore } from "../../store/useStore";
import ChatArea from "../Chat/ChatArea";

export default function HomePage() {
  const { activeServer, activeChannel } = useStore();

  if (!activeServer) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-text-muted bg-surface-high px-8">
        <div className="font-mono text-left space-y-1 text-sm">
          <p className="text-text-muted">
            <span className="text-brand-primary">$</span> sloth-voice --version
          </p>
          <p className="text-text-normal">sloth-voice v1.0.0</p>
          <p className="text-text-muted mt-2">
            <span className="text-brand-primary">$</span> server list
          </p>
          <p className="text-text-normal">
            no servers found. add one from the sidebar.
          </p>
          <p className="flex items-center gap-1 mt-2">
            <span className="text-brand-primary">$</span>&nbsp;
            <span className="inline-block w-2 h-4 bg-brand-primary opacity-80 animate-pulse" />
          </p>
        </div>
        <p className="text-text-muted text-xs tracking-widest uppercase">
          ← add a server to get started
        </p>
      </div>
    );
  }

  if (!activeChannel) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-text-muted bg-surface-high">
        <p className="font-mono text-sm">
          <span className="text-brand-primary">$</span>{" "}
          <span className="text-text-normal">channel select</span>
        </p>
        <p className="text-xs tracking-widest uppercase">
          choose a channel from the sidebar
        </p>
      </div>
    );
  }

  return <ChatArea />;
}
