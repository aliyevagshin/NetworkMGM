import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import Layout from "../components/Layout";
import { devicesAPI } from "../api";
import { useAuthStore } from "../store";
import { useQuery } from "@tanstack/react-query";
import { Terminal as TermIcon, X } from "lucide-react";

function SSHTerminal({ device, onClose }) {
  const termRef = useRef(null);
  const wsRef = useRef(null);
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    const term = new Terminal({
      theme: {
        background: "#0a0c12",
        foreground: "#e8eaf0",
        cursor: "#4f7cff",
        selectionBackground: "#4f7cff44",
      },
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 13,
      lineHeight: 1.6,
      cursorBlink: true,
      scrollback: 5000,
    });
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(termRef.current);
    fitAddon.fit();

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/ssh/${device.id}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => term.write("\r\nConnecting to " + device.hostname + "...\r\n");
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "output") term.write(msg.data);
      if (msg.type === "error") term.write(`\r\n\x1b[31m${msg.message}\x1b[0m\r\n`);
      if (msg.type === "connected") term.write(`\x1b[32mConnected to ${msg.host}\x1b[0m\r\n`);
    };
    ws.onclose = () => term.write("\r\n\x1b[33m[Session closed]\x1b[0m\r\n");

    term.onData((data) => ws.send(JSON.stringify({ type: "input", data })));

    const ro = new ResizeObserver(() => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    });
    ro.observe(termRef.current);

    return () => {
      ws.close();
      term.dispose();
      ro.disconnect();
    };
  }, [device.id]);

  return (
    <div className="flex flex-col h-full bg-[#0a0c12] rounded-xl overflow-hidden border border-border">
      <div className="flex items-center justify-between px-4 py-2 bg-surface border-b border-border">
        <div className="flex items-center gap-2 text-sm">
          <TermIcon size={13} className="text-accent" />
          <span className="font-mono text-white">{device.hostname}</span>
          <span className="text-muted font-mono">{device.ip_address}</span>
        </div>
        <button onClick={onClose} className="text-muted hover:text-white transition-colors">
          <X size={14} />
        </button>
      </div>
      <div ref={termRef} className="flex-1 p-2" style={{ minHeight: 0 }} />
    </div>
  );
}

export default function SSHConsole() {
  const { data: devices = [] } = useQuery({
    queryKey: ["devices"],
    queryFn: () => devicesAPI.list().then((r) => r.data),
    staleTime: 60_000,
  });
  const [active, setActive] = useState(null);
  const [search, setSearch] = useState("");

  const filtered = devices.filter((d) =>
    !search || d.hostname.toLowerCase().includes(search.toLowerCase()) || d.ip_address.includes(search)
  );

  return (
    <Layout title="SSH Console">
      <div className="flex gap-4 h-[calc(100vh-8rem)]">
        <div className="w-56 shrink-0 bg-surface border border-border rounded-xl flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-border">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search device..."
              className="w-full bg-bg border border-border rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-accent"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
          {filtered.map((d) => (
            <button
              key={d.id}
              onClick={() => setActive(d)}
              className={`w-full text-left px-4 py-2.5 border-b border-border text-sm transition-colors ${
                active?.id === d.id ? "bg-accent/15 text-accent" : "text-muted hover:text-white hover:bg-white/5"
              }`}
            >
              <div className="font-mono truncate">{d.hostname}</div>
              <div className="font-mono text-xs opacity-60 truncate">{d.ip_address}</div>
            </button>
          ))}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          {active ? (
            <SSHTerminal key={active.id} device={active} onClose={() => setActive(null)} />
          ) : (
            <div className="h-full bg-surface border border-border rounded-xl flex items-center justify-center text-muted">
              <div className="text-center">
                <TermIcon size={32} className="mx-auto mb-3 opacity-40" />
                <p className="text-sm">Select a device to start an SSH session</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
