import { NavLink, Link } from "react-router-dom";
import {
  LayoutDashboard, Server, Terminal, Network, Activity,
  BarChart2, Package, FolderOpen, Lock, FileText, Settings, LogOut,
  HardDrive, ScrollText, KeyRound, SendToBack, Globe, Gauge, Bell,
} from "lucide-react";
import { useAuthStore } from "../store";

const nav = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/devices",      icon: Server,        label: "Devices",       preload: () => import("../pages/DeviceHub") },
  { to: "/ssh",          icon: Terminal,      label: "SSH Console",   preload: () => import("../pages/SSHConsole") },
  { to: "/webconsole",   icon: Globe,         label: "Web Console",   preload: () => import("../pages/WebConsole") },
  { to: "/bulk-config",  icon: SendToBack,    label: "Bulk Config",   preload: () => import("../pages/BulkConfig") },
  { to: "/ipam",         icon: Network,       label: "IPAM",          preload: () => import("../pages/IPAM") },
  { to: "/topology",     icon: Activity,      label: "Topology",      preload: () => import("../pages/Topology") },
  { to: "/monitoring",   icon: BarChart2,     label: "Monitoring",    preload: () => import("../pages/Monitoring") },
  { to: "/netflow",      icon: Gauge,         label: "NetFlow",       preload: () => import("../pages/NetFlow") },
  { to: "/backup",       icon: HardDrive,     label: "Backups",       preload: () => import("../pages/Backup") },
  { to: "/inventory",    icon: Package,       label: "Inventory",     preload: () => import("../pages/Inventory") },
  { to: "/files",        icon: FolderOpen,    label: "Files",         preload: () => import("../pages/Files") },
  { to: "/vault",        icon: Lock,          label: "Vault",         preload: () => import("../pages/Vault") },
  { to: "/keypass",      icon: KeyRound,      label: "KeyPass",       preload: () => import("../pages/KeyPass") },
  { to: "/notifications",icon: Bell,          label: "Notifications", preload: () => import("../pages/Notifications") },
  { to: "/logs",         icon: ScrollText,    label: "Logs",          preload: () => import("../pages/Logs") },
  { to: "/docs",         icon: FileText,      label: "Docs",          preload: () => import("../pages/Docs") },
  { to: "/settings",     icon: Settings,      label: "Settings",      preload: () => import("../pages/Settings") },
];

export default function Sidebar() {
  const logout = useAuthStore((s) => s.logout);

  return (
    <aside className="w-[220px] min-h-screen bg-surface border-r border-border flex flex-col shrink-0">
      <div className="px-4 py-5 border-b border-border">
        <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
            <Network size={14} className="text-white" />
          </div>
          <span className="font-semibold text-sm text-white">NMS</span>
        </Link>
      </div>

      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {nav.map(({ to, icon: Icon, label, preload }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            onMouseEnter={() => preload?.()}
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
