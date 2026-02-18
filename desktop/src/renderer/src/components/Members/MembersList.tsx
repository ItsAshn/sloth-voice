import { useEffect } from "react";
import { useStore } from "../../store/useStore";
import { fetchMembers, configureApi } from "../../api/server";

export default function MembersList() {
  const { activeServer, sessions, members, setMembers } = useStore();
  const session = activeServer ? sessions[activeServer.id] : undefined;

  useEffect(() => {
    if (!activeServer || !session) return;
    configureApi(activeServer.url, session.token);
    fetchMembers().then(setMembers).catch(console.error);
  }, [activeServer, session, setMembers]);

  if (!activeServer || !session) return null;

  return (
    <div className="w-44 bg-surface-low shrink-0 flex flex-col border-l border-surface-mid">
      <div className="px-3 h-11 flex items-center border-b border-surface-mid">
        <span className="label-xs">members ({members.length})</span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {members.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-highest cursor-default transition-colors"
          >
            <div className="w-6 h-6 rounded bg-brand-primary/20 border border-brand-primary/30 flex items-center justify-center text-[10px] font-bold text-brand-primary shrink-0">
              {(m.display_name || m.username).slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-text-normal text-[11px] font-medium truncate">
                {m.display_name || m.username}
                {m.role === "admin" && (
                  <span className="ml-1 text-brand-primary text-[9px] font-semibold">
                    [admin]
                  </span>
                )}
              </p>
              {m.id === session.user.id && (
                <p className="text-brand-primary text-[10px]">you</p>
              )}
            </div>
          </div>
        ))}
        {members.length === 0 && (
          <p className="text-text-muted text-[11px] text-center mt-4 font-mono">
            no members
          </p>
        )}
      </div>
    </div>
  );
}
