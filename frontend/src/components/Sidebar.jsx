import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Server, Terminal, Network, Activity,
  BarChart2, Package, FolderOpen, Lock, FileText, Settings, LogOut,
  HardDrive, ScrollText, KeyRound,
} from "lucide-react";
import { useAuthStore } from "../store";

const nav = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/devices", icon: Server, label: "Devices" },
  { to: "/ssh", icon: Terminal, label: "SSH Console" },
  { to: "/ipam", icon: Network, label: "IPAM" },
  { to: "/topology", icon: Activity, label: "Topology" },
  { to: "/monitoring", icon: BarChart2, label: "Monitoring" },
  { to: "/backup", icon: HardDrive, label: "Backups" },
  { to: "/inventory", icon: Package, label: "Inventory" },
  { to: "/files", icon: FolderOpen, label: "Files" },
  { to: "/vault", icon: Lock, label: "Vault" },
  { to: "/keypass", icon: KeyRound, label: "KeyPass" },
  { to: "/logs", icon: ScrollText, label: "Logs" },
  { to: "/docs", icon: FileText, label: "Docs" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function Sidebar() {
  const logout = useAuthStore((s) => s.logout);

  return (
    <aside className="w-[220px] min-h-screen bg-surface border-r border-border flex flex-col shrink-0">
      <div className="px-4 py-5 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
            <Network size={14} className="text-white" />
          </div>
          <span className="font-semibold text-sm text-white">NMS</span>
        </div>
      </div>

      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-accent/15 text-accent font-medium"
                  : "text-muted hover:text-white hover:bg-white/5"
              }`
            }
          >
            <Icon size={15} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-2 border-t border-border">
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <LogOut size={15} />
          Logout
        </button>
      </div>
    </aside>
  );
}
