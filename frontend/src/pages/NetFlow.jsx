import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { RefreshCw, Gauge } from "lucide-react";
import Layout from "../components/Layout";
import { netflowAPI } from "../api";

const PROTO_COLORS = {
  TCP: "#6366f1",
  UDP: "#22d3ee",
  ICMP: "#f59e0b",
  GRE: "#a78bfa",
  OSPF: "#34d399",
};

function fmtBytes(b) {
  if (!b) return "0 B";
  const k = 1024;
  const s = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${(b / Math.pow(k, i)).toFixed(1)} ${s[i]}`;
}

function StatCard({ label, value }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="text-xs text-muted mb-1">{label}</div>
      <div className="text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

const TOOLTIP_STYLE = {
  background: "#1a1d27",
  border: "1px solid #2a2d3e",
  borderRadius: 8,
  fontSize: 12,
};

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

  const { data: flows = [], isLoading: flowsLoading } = useQuery({
    queryKey: ["netflow-flows", deviceId, hours],
    queryFn: () =>
      netflowAPI.flows({ device_id: deviceId, hours, limit: 200 }).then((r) => r.data),
    refetchInterval: 30_000,
  });

  const protoData = (summary?.protocol_breakdown ?? []).map((p) => ({
    name: p.protocol,
    value: p.bytes,
    count: p.count,
  }));

  const talkersData = (summary?.top_talkers ?? []).slice(0, 8).map((t) => ({
    ip: t.ip,
    bytes: t.bytes,
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
              <p className="text-xs text-muted">Traffic flow analysis — routers &amp; firewalls</p>
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
              No router/firewall devices found. Add one in Devices.
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

        {/* Charts */}
        <div className="grid grid-cols-2 gap-4">
          {/* Protocol distribution */}
          <div className="bg-surface border border-border rounded-xl p-4">
            <h3 className="text-sm font-medium text-white mb-3">Protocol Distribution</h3>
            {protoData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={protoData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    dataKey="value"
                    nameKey="name"
                    paddingAngle={3}
                  >
                    {protoData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={PROTO_COLORS[entry.name] ?? "#64748b"}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => fmtBytes(v)}
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: "#e8eaf0" }}
                  />
                  <Legend
                    formatter={(v) => (
                      <span style={{ color: "#94a3b8", fontSize: 12 }}>{v}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted text-sm">
                {summaryLoading ? "Loading…" : "No data"}
              </div>
            )}
          </div>

          {/* Top talkers */}
          <div className="bg-surface border border-border rounded-xl p-4">
            <h3 className="text-sm font-medium text-white mb-3">Top Source IPs</h3>
            {talkersData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={talkersData}
                  layout="vertical"
                  margin={{ left: 8, right: 20, top: 4, bottom: 4 }}
                >
                  <XAxis
                    type="number"
                    tickFormatter={fmtBytes}
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="ip"
                    width={115}
                    tick={{ fill: "#94a3b8", fontSize: 10, fontFamily: "monospace" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(v) => fmtBytes(v)}
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: "#e8eaf0" }}
                  />
                  <Bar dataKey="bytes" fill="#6366f1" radius={[0, 4, 4, 0]} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted text-sm">
                {summaryLoading ? "Loading…" : "No data"}
              </div>
            )}
          </div>
        </div>

        {/* Flow records table */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-medium text-white">Flow Records</h3>
            <span className="text-xs text-muted">{flows.length} records</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {[
                    "Source IP", "Src Port",
                    "Destination IP", "Dst Port",
                    "Protocol", "Bytes", "Packets", "Time",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left text-xs text-muted font-medium whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {flowsLoading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted text-sm">
                      Loading…
                    </td>
                  </tr>
                ) : flows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted text-sm">
                      No flows in the selected time range
                    </td>
                  </tr>
                ) : (
                  flows.slice(0, 100).map((f) => (
                    <tr
                      key={f.id}
                      className="border-b border-border/40 hover:bg-white/[0.02] transition-colors"
                    >
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
                      <td className="px-4 py-2 text-xs text-muted">
                        {f.packets?.toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted whitespace-nowrap">
                        {f.timestamp
                          ? new Date(f.timestamp).toLocaleTimeString()
                          : "—"}
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
