import Layout from "../components/Layout";
import { Terminal, Server, Network, Lock, BarChart2 } from "lucide-react";

const sections = [
  {
    icon: Server,
    title: "Device Management",
    items: [
      "Add devices with hostname, IP, SSH port, vendor, and device type",
      "Link vault credentials for automatic SSH/SNMP authentication",
      "Test SSH connectivity with one click",
      "Pull running config manually or via scheduled backup",
    ],
  },
  {
    icon: Terminal,
    title: "SSH Console",
    items: [
      "Full xterm.js terminal with 5000-line scrollback",
      "WebSocket-based bidirectional SSH proxy — credentials never reach the browser",
      "Session logging with audit trail",
      "Resize-aware PTY (auto-fits to window)",
    ],
  },
  {
    icon: Network,
    title: "IPAM",
    items: [
      "Create subnets with CIDR notation",
      "ICMP sweep to discover live hosts",
      "Track IP status: free / allocated / reserved",
      "VLAN tagging and gateway documentation",
    ],
  },
  {
    icon: Lock,
    title: "Vault",
    items: [
      "Passwords encrypted with AES-256 (Fernet) before storage",
      "Role-based access: operator cannot view vault passwords",
      "All access events written to audit log",
      "10-second auto-hide after password reveal",
    ],
  },
  {
    icon: BarChart2,
    title: "Monitoring",
    items: [
      "Automatic ICMP ping + SNMP polling every 30 seconds",
      "Metric sparklines for CPU, memory, RTT, packet loss",
      "Alert thresholds: CPU >70% warn, >90% critical",
      "License expiry alerts at 90/30/7 days",
    ],
  },
];

export default function Docs() {
  return (
    <Layout title="Documentation">
      <div className="max-w-3xl space-y-6">
        <div className="bg-surface border border-border rounded-xl p-6">
          <h2 className="text-white font-semibold mb-1">NMS — Network Management System</h2>
          <p className="text-muted text-sm">
            A full-stack network management platform built with FastAPI, React, and Docker.
            Manage devices, monitor metrics, backup configs, and manage IP addressing from one interface.
          </p>
        </div>
        {sections.map(({ icon: Icon, title, items }) => (
          <div key={title} className="bg-surface border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Icon size={15} className="text-accent" />
              <h3 className="font-semibold text-white text-sm">{title}</h3>
            </div>
            <ul className="space-y-1.5">
              {items.map((item) => (
                <li key={item} className="text-sm text-muted flex items-start gap-2">
                  <span className="text-accent mt-0.5">›</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Layout>
  );
}
