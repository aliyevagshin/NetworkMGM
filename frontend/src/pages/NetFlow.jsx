import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { RefreshCw, Gauge, TrendingUp } from "lucide-react";
import Layout from "../components/Layout";
import { netflowAPI } from "../api";

// ── Colour palette ────────────────────────────────────────────────────────────
const PROTO_COLORS = {
  TCP: "#6366f1", UDP: "#22d3ee", ICMP: "#f59e0b",
  GRE: "#a78bfa", OSPF: "#34d399",
};
const IP_PALETTE = [
  "#6366f1", "#22d3ee", "#f59e0b", "#a78bfa", "#34d399",
  "#f43f5e", "#fb923c", "#84cc16", "#38bdf8", "#e879f9",
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtBytes(b) {
  if (!b) return "0 B";
  const k = 1024, s = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${(b / Math.pow(k, i)).toFixed(1)} ${s[i]}`;
}

function fmtBytesAxis(b) {
  if (b >= 1073741824) return `${(b / 1073741824).toFixed(1)}G`;
  if (b >= 1048576)    return `${(b / 1048576).toFixed(1)}M`;
  if (b >= 1024)       return `${(b / 1024).toFixed(1)}K`;
  return `${b}B`;
}

const TT_STYLE = {
  background: "#1a1d27", border: "1px solid #2a2d3e",
  borderRadius: 8, fontSize: 12,
};

// ── Sub-components ────────────────────────────────────────────────────────────
function StatCard({ label, value }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="text-xs text-muted mb-1">{label}</div>
      <div className="text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

function DonutCard({ title, data, colorMap, nameKey = "ip", valueKey = "bytes" }) {
  const slices = data.slice(0, 8).map((d, i) => ({
    name: d[nameKey],
    value: d[valueKey],
    color: colorMap
      ? colorMap[d[nameKey]] ?? IP_PALETTE[i % IP_PALETTE.length]
      : IP_PALETTE[i % IP_PALETTE.length],
  }));
  const total = slices.reduce((s, x) => s + x.value, 0);

  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex flex-col">
      <h3 className="text-sm font-medium text-white mb-2">{title}</h3>
      {slices.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted text-xs">No data</div>
      ) : (
        <div className="flex gap-3 items-center">
          <ResponsiveContainer width={140} height={140}>
            <PieChart>
              <Pie
                data={slices}
                cx="50%" cy="50%"
                innerRadius={42} outerRadius={65}
                dataKey="value" nameKey="name"
                paddingAngle={2} startAngle={90} endAngle={-270}
              >
                {slices.map((s) => (
                  <Cell key={s.name} fill={s.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v) => fmtBytes(v)}
                contentStyle={TT_STYLE}
                labelStyle={{ color: "#e8eaf0" }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex-1 space-y-1.5 min-w-0">
            {slices.map((s) => (
              <div key={s.name} className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: s.color }}
                />
                <span className="text-xs text-muted font-mono truncate flex-1" title={s.name}>
                  {s.name}
                </span>
                <span className="text-xs text-white shrink-0">
                  {total ? `${((s.value / total) * 100).toFixed(0)}%` : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ConnectionsCard({ title, data }) {
  const top = data.slice(0, 8);
  const max = top[0]?.bytes ?? 1;
  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex flex-col">
      <h3 className="text-sm font-medium text-white mb-3">{title}</h3>
      {top.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted text-xs">No data</div>
      ) : (
        <div className="space-y-2">
          {top.map((c, i) => (
            <div key={i} className="space-y-0.5">
              <div className="flex justify-between items-center gap-2">
                <span className="text-[11px] font-mono text-muted whitespace-nowrap">
                  {c.src} → {c.dst}
                </span>
                <span className="text-xs text-white shrink-0">{fmtBytes(c.bytes)}</span>
              </div>
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(c.bytes / max) * 100}%`,
                    background: IP_PALETTE[i % IP_PALETTE.length],
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function NetFlow() {
  const [selectedDevice, setSelectedDevice] = useState("");
  const [hours, setHours] = useState(1);

  const deviceId = selectedDevice ? Number(selectedDevice) : undefined;

  const { data: devices = [] } = useQuery({
    queryKey: ["netflow-devices"],
    queryFn: () => netflowAPI.devices().then((r) => r.data),
    refetchInterval: 60_000,
  });

  const {
    data: summary,
    isLoading: summaryLoading,
    refetch,
  } = useQuery({
    queryKey: ["netflow-summary", deviceId, hours],
    queryFn: () => netflowAPI.summary(deviceId, hours).then((r) => r.data),
    refetchInterval: 30_000,
  });

  const { data: timeline = [], isLoading: timelineLoading } = useQuery({
    queryKey: ["netflow-timeline", deviceId, hours],
    queryFn: () => netflowAPI.timeline(deviceId, hours).then((r) => r.data),
    refetchInterval: 30_000,
  });

  const { data: flows = [], isLoading: flowsLoading } = useQuery({
    queryKey: ["netflow-flows", deviceId, hours],
    queryFn: () =>
      netflowAPI.flows({ device_id: deviceId, hours, limit: 200 }).then((r) => r.data),
    refetchInterval: 30_000,
  });

  const protoData = (summary?.protocol_breakdown ?? []).map((p) => ({
    ip: p.protocol,
    bytes: p.bytes,
  }));

  return (
    <Layout>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gauge size={18} className="text-accent" />
            <div>
              <h1 className="text-xl font-semibold text-white leading-tight">NetFlow</h1>
              <p className="text-xs text-muted">Traffic analysis — routers &amp; firewalls only</p>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-muted hover:text-white transition-colors"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            className="bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent/50"
          >
            <option value="">All devices</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.hostname} ({d.ip_address}) — {d.device_type}
              </option>
            ))}
          </select>
          <select
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent/50"
          >
            <option value={1}>Last 1 hour</option>
            <option value={6}>Last 6 hours</option>
            <option value={24}>Last 24 hours</option>
          </select>
          {devices.length === 0 && (
            <span className="text-xs text-muted italic">
              No router/firewall devices found — add one in Devices.
            </span>
          )}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            label="Total Flows"
            value={summaryLoading ? "…" : (summary?.total_flows ?? 0).toLocaleString()}
          />
          <StatCard
            label="Total Traffic"
            value={summaryLoading ? "…" : fmtBytes(summary?.total_bytes ?? 0)}
          />
          <StatCard
            label="Total Packets"
            value={summaryLoading ? "…" : (summary?.total_packets ?? 0).toLocaleString()}
          />
        </div>

        {/* Top 3 donuts */}
        <div className="grid grid-cols-3 gap-4">
          <DonutCard
            title="Top Talkers"
            data={summary?.top_talkers ?? []}
          />
          <ConnectionsCard
            title="Top Connections"
            data={summary?.top_connections ?? []}
          />
          <DonutCard
            title="Top Protocols"
            data={protoData}
            colorMap={PROTO_COLORS}
          />
        </div>

        {/* Live traffic timeline */}
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={14} className="text-accent" />
            <h3 className="text-sm font-medium text-white">Live Traffic</h3>
            <span className="text-xs text-muted ml-auto">bytes / minute</span>
          </div>
          {timelineLoading ? (
            <div className="h-[180px] flex items-center justify-center text-muted text-sm">Loading…</div>
          ) : timeline.length < 2 ? (
            <div className="h-[180px] flex items-center justify-center text-muted text-sm">
              Collecting data — first flows appear after ~60 s
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={timeline} margin={{ left: 8, right: 8, top: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="nfGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3e" vertical={false} />
                <XAxis
                  dataKey="time"
                  tick={{ fill: "#64748b", fontSize: 10 }}
                  axisLine={false} tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={fmtBytesAxis}
                  tick={{ fill: "#64748b", fontSize: 10 }}
                  axisLine={false} tickLine={false} width={48}
                />
                <Tooltip
                  formatter={(v) => fmtBytes(v)}
                  labelFormatter={(l) => `Time: ${l}`}
                  contentStyle={TT_STYLE}
                  labelStyle={{ color: "#e8eaf0" }}
                />
                <Area
                  type="monotone"
                  dataKey="bytes"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="url(#nfGrad)"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Flow records table */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-medium text-white">Flow Records</h3>
            <span className="text-xs text-muted">{flows.length} records (newest first)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Source IP", "Src Port", "Destination IP", "Dst Port",
                    "Protocol", "Bytes", "Packets", "Time"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs text-muted font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {flowsLoading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted text-sm">Loading…</td>
                  </tr>
                ) : flows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted text-sm">
                      No flows in the selected time range
                    </td>
                  </tr>
                ) : (
                  flows.slice(0, 100).map((f) => (
                    <tr key={f.id} className="border-b border-border/40 hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-2 font-mono text-xs text-white">{f.src_ip}</td>
                      <td className="px-4 py-2 text-xs text-muted">{f.src_port || "—"}</td>
                      <td className="px-4 py-2 font-mono text-xs text-white">{f.dst_ip}</td>
                      <td className="px-4 py-2 text-xs text-muted">{f.dst_port || "—"}</td>
                      <td className="px-4 py-2">
                        <span
                          className="px-2 py-0.5 rounded text-xs font-medium"
                          style={{
                            background: (PROTO_COLORS[f.protocol] ?? "#64748b") + "22",
                            color: PROTO_COLORS[f.protocol] ?? "#94a3b8",
                          }}
                        >
                          {f.protocol}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted">{fmtBytes(f.bytes)}</td>
                      <td className="px-4 py-2 text-xs text-muted">{f.packets?.toLocaleString()}</td>
                      <td className="px-4 py-2 text-xs text-muted whitespace-nowrap">
                        {f.timestamp ? new Date(f.timestamp).toLocaleTimeString() : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
