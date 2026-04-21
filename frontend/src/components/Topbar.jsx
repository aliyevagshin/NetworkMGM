import { Bell, User } from "lucide-react";
import { useAlertStore, useAuthStore } from "../store";
import { Link } from "react-router-dom";

export default function Topbar({ title }) {
  const { count } = useAlertStore();
  const { user } = useAuthStore();
  const totalAlerts = count.critical + count.warning;

  return (
    <header className="h-14 border-b border-border bg-surface flex items-center justify-between px-6 shrink-0">
      <h1 className="font-semibold text-white">{title}</h1>
      <div className="flex items-center gap-4">
        <Link to="/monitoring" className="relative text-muted hover:text-white transition-colors">
          <Bell size={18} />
          {totalAlerts > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center text-white font-bold">
              {totalAlerts > 9 ? "9+" : totalAlerts}
            </span>
          )}
        </Link>
        <div className="flex items-center gap-2 text-sm text-muted">
          <User size={15} />
          <span>{user?.username || "..."}</span>
          <span className="px-1.5 py-0.5 rounded text-xs bg-accent/20 text-accent">{user?.role}</span>
        </div>
      </div>
    </header>
  );
}
