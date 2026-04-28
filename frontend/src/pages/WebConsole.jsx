import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { devicesAPI } from "../api";
import { useAuthStore } from "../store";
import { Terminal as TermIcon, Globe, ExternalLink, RefreshCw, Lock, Shield } from "lucide-react";

/* ─── SSH Terminal ─────────────────────────────────────────── */
function SSHPanel({ device }) {
  const termRef = useRef(null);
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    const term = new Terminal({
      theme: {
        background: "#0a0c12", foreground: "#e8eaf0",
        cursor: "#4f7cff", selectionBackground: "#4f7cff44",
      },
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 13, lineHeight: 1.6, cursorBlink: true, scrollback: 5000,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(termRef.current);
    fitAddon.fit();

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/ssh/${device.id}?token=${token}`);

    ws.onopen    = () => term.write("\r\nConnecting to " + device.hostname + "...\r\n");
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "output")    term.write(msg.data);
      if (msg.type === "error")     term.write(`\r\n\x1b[31m${msg.message}\x1b[0m\r\n`);
      if (msg.type === "connected") term.write(`\x1b[32mConnected to ${msg.host}\x1b[0m\r\n`);
    };
    ws.onclose = () => term.write("\r\n\x1b[33m[Session closed]\x1b[0m\r\n");
    term.onData((data) => ws.send(JSON.stringify({ type: "input", data })));

    const ro = new ResizeObserver(() => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    });
    ro.observe(termRef.current);

    return () => { ws.close(); term.dispose(); ro.disconnect(); };
  }, [device.id]);

  return (
    <div className="flex flex-col h-full bg-[#0a0c12] rounded-b-xl rounded-tr-xl overflow-hidden border border-border border-t-0">
      <div ref={termRef} className="flex-1 p-2" style={{ minHeight: 0 }} />
    </div>
  );
}

/* ─── Web Panel (proxied iframe) ───────────────────────────── */
function WebPanel({ device, protocol, token }) {
  const defaultPort = protocol === "https" ? 443 : 80;
  const [port, setPort]       = useState(defaultPort);
  const [connected, setConnected] = useState(false);
  const [frameKey, setFrameKey]   = useState(0);
  const iframeRef = useRef(null);

  const proxyUrl = (p) =>
    `/api/proxy/${device.id}?protocol=${protocol}&port=${p}&path=/&token=${token}`;

  const connect = () => { setConnected(true); setFrameKey((k) => k + 1); };
  const reload  = () => setFrameKey((k) => k + 1);
  const openNew = () => window.open(`${protocol}://${device.ip_address}:${port}`, "_blank", "noopener,noreferrer");

  return (
    <div className="flex flex-col h-full bg-surface rounded-b-xl rounded-tr-xl border border-border border-t-0 overflow-hidden">
      {/* Toolbar */}
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-3 shrink-0 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-muted">
          {protocol === "https"
            ? <Lock size={11} className="text-green-400" />
            : <Globe size={11} />}
          <span className="font-mono">{protocol}://{device.ip_address}:</span>
        </div>
        <input
          type="number"
          value={port}
          onChange={(e) => setPort(Number(e.target.value))}
          className="w-20 bg-bg border border-border rounded-lg px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-accent"
          min={1} max={65535}
        />
        <button
          onClick={connect}
          className="px-3 py-1 text-xs bg-accent hover:bg-accent/90 text-white rounded-lg transition-colors"
        >
          {connected ? "Reconnect" : "Connect"}
        </button>
        {connected && (
          <>
            <button onClick={reload} className="p-1 text-muted hover:text-white transition-colors" title="Reload">
              <RefreshCw size={12} />
            </button>
            <button onClick={openNew} className="flex items-center gap-1 text-xs text-muted hover:text-white transition-colors ml-auto" title="Open in new tab">
              <ExternalLink size={11} /> New tab
            </button>
          </>
        )}
      </div>

      {/* Content */}
      {!connected ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted">
          {protocol === "https"
            ? <Lock size={36} className="opacity-20 text-green-400" />
            : <Globe size={36} className="opacity-20" />}
          <p className="text-sm">
            Port ayarla və <span className="text-accent">Connect</span> düyməsinə bas
          </p>
          <p className="text-xs opacity-50">
            {protocol === "https" ? "HTTPS · Self-signed cert dəstəklənir" : "HTTP"}
          </p>
        </div>
      ) : (
        <iframe
          key={frameKey}
          ref={iframeRef}
          src={proxyUrl(port)}
          title={`${device.hostname} web UI`}
          className="flex-1 border-0 w-full"
          sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        />
      )}
    </div>
  );
}

/* ─── Main Page ────────────────────────────────────────────── */
const TABS = [
  { id: "ssh",   label: "SSH",   icon: TermIcon },
  { id: "http",  label: "HTTP",  icon: Globe },
  { id: "https", label: "HTTPS", icon: Lock },
];

export default function WebConsole() {
  const [devices, setDevices]   = useState([]);
  const [active, setActive]     = useState(null);
  const [tab, setTab]           = useState("ssh");
  const [search, setSearch]     = useState("");
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    devicesAPI.list().then((r) => {
      const all = Array.isArray(r.data) ? r.data : [];
      setDevices(all.filter((d) => d.device_type === "firewall"));
    });
  }, []);

  const filtered = devices.filter(
    (d) => !search || d.hostname.toLowerCase().includes(search.toLowerCase()) || d.ip_address.includes(search)
  );

  const selectDevice = (d) => { setActive(d); setTab("ssh"); };

  return (
    <Layout title="Web Console">
      <div className="flex gap-4 h-[calc(100vh-8rem)]">

        {/* Left: firewall device list */}
        <div className="w-56 shrink-0 bg-surface border border-border rounded-xl flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center gap-2">
            <Shield size={12} className="text-accent shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search firewall..."
              className="flex-1 bg-transparent text-xs text-white focus:outline-none placeholder:text-muted"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="px-4 py-6 text-xs text-muted text-center">
                {devices.length === 0 ? "No firewall devices found" : "No match"}
              </p>
            )}
            {filtered.map((d) => (
              <button
                key={d.id}
                onClick={() => selectDevice(d)}
                className={`w-full text-left px-4 py-2.5 border-b border-border text-sm transition-colors ${
                  active?.id === d.id
                    ? "bg-accent/15 text-accent"
                    : "text-muted hover:text-white hover:bg-white/5"
                }`}
              >
                <div className="font-mono truncate">{d.hostname}</div>
                <div className="font-mono text-xs opacity-60 truncate">{d.ip_address}</div>
                <div className="text-[10px] opacity-40 mt-0.5">{d.vendor}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: tab panel */}
        <div className="flex-1 min-w-0 flex flex-col">
          {active ? (
            <>
              {/* Tab bar */}
              <div className="flex items-end gap-0 shrink-0">
                {TABS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium border rounded-t-lg transition-colors -mb-px z-10 ${
                      tab === id
                        ? "bg-surface border-border border-b-surface text-white"
                        : "bg-bg border-transparent text-muted hover:text-white"
                    }`}
                  >
                    <Icon size={13} />
                    {label}
                  </button>
                ))}
                <div className="flex-1 border-b border-border pb-px" />
                <span className="text-xs text-muted font-mono border-b border-border pb-2.5 pr-1">
                  {active.hostname} · {active.ip_address}
                </span>
              </div>

              <div className="flex-1 min-h-0">
                {tab === "ssh"   && <SSHPanel  key={`ssh-${active.id}`}   device={active} />}
                {tab === "http"  && <WebPanel  key={`http-${active.id}`}  device={active} protocol="http"  token={token} />}
                {tab === "https" && <WebPanel  key={`https-${active.id}`} device={active} protocol="https" token={token} />}
              </div>
            </>
          ) : (
            <div className="flex-1 bg-surface border border-border rounded-xl flex items-center justify-center text-muted">
              <div className="text-center">
                <Shield size={36} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm">Select a firewall to connect</p>
                <p className="text-xs mt-1 opacity-50">SSH · HTTP · HTTPS</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
