import Layout from "../components/Layout";
import StatusBadge from "../components/StatusBadge";
import { devicesAPI, alertsAPI, monitoringAPI } from "../api";
import { Server, Wifi, AlertTriangle, Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
} from "recharts";

function StatCard({ icon: Icon, label, value, sub, color = "accent", onClick }) {
  const colors = { accent: "text-accent", green: "text-green-400", amber: "text-amber-400", red: "text-red-400" };
  return (
    <div
      onClick={onClick}
      className={`bg-surface border border-border rounded-xl p-5 ${onClick ? "cursor-pointer hover:border-accent/50 transition-colors" : ""}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted mb-1">{label}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
          {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
        </div>
        <div className={`p-2 rounded-lg bg-white/5 ${colors[color]}`}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

const DONUT_COLORS = { online: "#22c55e", offline: "#ef4444", unknown: "#6b7280" };

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: devices = [], isLoading: loadD } = useQuery({ queryKey: ["devices"], queryFn: () => devicesAPI.list().then(r => r.data), staleTime: 30_000 });
  const { data: alerts = [], isLoading: loadA } = useQuery({ queryKey: ["alerts"], queryFn: () => alertsAPI.list().then(r => r.data), staleTime: 10_000, refetchInterval: 15_000 });
  const { data: monDevices = [] } = useQuery({ queryKey: ["monitoring"], queryFn: () => monitoringAPI.all().then(r => r.data), staleTime: 20_000, refetchInterval: 30_000 });
  const loading = loadD || loadA;

  const online = devices.filter((d) => d.status === "online").length;
  const offline = devices.filter((d) => d.status === "offline").length;
  const unknown = devices.filter((d) => !["online","offline"].includes(d.status)).length;
  const critical = alerts.filter((a) => a.severity === "critical").length;

  const donutData = [
    { name: "Online", value: online },
    { name: "Offline", value: offline },
    { name: "Unknown", value: unknown },
  ].filter((d) => d.value > 0);

  const cpuBarData = monDevices
    .filter((d) => d.metrics?.cpu != null)
    .sort((a, b) => b.metrics.cpu - a.metrics.cpu)
    .slice(0, 8)
    .map((d) => ({ name: d.hostname.length > 10 ? d.hostname.slice(0, 10) + "…" : d.hostname, cpu: Math.round(d.metrics.cpu) }));

  const alertBySeverity = ["info","warning","critical"].map((s) => ({
    name: s,
    count: alerts.filter((a) => a.severity === s).length,
  }));

  return (
    <Layout title="Dashboard">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Server} label="Total Devices" value={devices.length} color="accent" onClick={() => navigate("/devices")} />
        <StatCard icon={Wifi} label="Online" value={online} sub={`${devices.length ? Math.round((online / devices.length) * 100) : 0}% uptime`} color="green" onClick={() => navigate("/devices")} />
        <StatCard icon={Activity} label="Offline" value={offline} color="red" onClick={() => navigate("/devices")} />
        <StatCard icon={AlertTriangle} label="Active Alerts" value={alerts.length} sub={`${critical} critical`} color="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Device status donut */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-3">Device Status</h2>
          {devices.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={110} height={110}>
                <PieChart>
                  <Pie data={donutData} cx="50%" cy="50%" innerRadius={30} outerRadius={50} dataKey="value" strokeWidth={0}>
                    {donutData.map((entry) => (
                      <Cell key={entry.name} fill={DONUT_COLORS[entry.name.toLowerCase()] || "#6b7280"} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#1a1d27", border: "1px solid #2a2d3a", borderRadius: 8, fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5">
                {donutData.map((d) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <span className="w-2 h-2 rounded-full" style={{ background: DONUT_COLORS[d.name.toLowerCase()] }} />
                    <span className="text-muted">{d.name}</span>
                    <span className="text-white font-medium ml-auto pl-4">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-muted text-sm text-center py-8">No devices</div>
          )}
        </div>

        {/* CPU bar chart */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-3">CPU Usage (Top Devices)</h2>
          {cpuBarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={110}>
              <BarChart data={cpuBarData} layout="vertical" margin={{ left: 0, right: 10 }}>
                <XAxis type="number" domain={[0, 100]} tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} unit="%" />
                <YAxis type="category" dataKey="name" tick={{ fill: "#9ca3af", fontSize: 10 }} tickLine={false} axisLine={false} width={60} />
                <CartesianGrid horizontal={false} stroke="#2a2d3a" />
                <Tooltip contentStyle={{ background: "#1a1d27", border: "1px solid #2a2d3a", borderRadius: 8, fontSize: 11 }} formatter={(v) => [`${v}%`, "CPU"]} />
                <Bar dataKey="cpu" fill="#4f7cff" radius={[0, 3, 3, 0]} maxBarSize={10} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-muted text-sm text-center py-8">No metrics yet — poll devices</div>
          )}
        </div>

        {/* Alert severity breakdown */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-3">Alert Breakdown</h2>
          <ResponsiveContainer width="100%" height={110}>
            <BarChart data={alertBySeverity} margin={{ left: -20, right: 10 }}>
              <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} />
              <CartesianGrid vertical={false} stroke="#2a2d3a" />
              <Tooltip contentStyle={{ background: "#1a1d27", border: "1px solid #2a2d3a", borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="count" radius={[3,3,0,0]} maxBarSize={28}
                fill="#f59e0b"
                label={false}
              >
                {alertBySeverity.map((entry) => {
                  const c = entry.name === "critical" ? "#ef4444" : entry.name === "warning" ? "#f59e0b" : "#4f7cff";
                  return <Cell key={entry.name} fill={c} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface border border-border rounded-xl">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-white text-sm">Recent Devices</h2>
          </div>
          <div className="divide-y divide-border">
            {loading ? (
              <div className="p-5 text-muted text-sm">Loading...</div>
            ) : devices.slice(0, 8).map((d) => (
              <div key={d.id} className="px-5 py-3 flex items-center justify-between hover:bg-white/2 transition-colors">
                <div>
                  <div className="text-sm text-white font-mono">{d.hostname}</div>
                  <div className="text-xs text-muted font-mono">{d.ip_address}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted">{d.device_type}</span>
                  <StatusBadge status={d.status} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-white text-sm">Active Alerts</h2>
          </div>
          <div className="divide-y divide-border">
            {loading ? (
              <div className="p-5 text-muted text-sm">Loading...</div>
            ) : alerts.slice(0, 8).map((a) => (
              <div key={a.id} className="px-5 py-3 hover:bg-white/2 transition-colors">
                <div className="flex items-center gap-2 mb-0.5">
                  <StatusBadge status={a.severity} />
                  <span className="text-xs text-muted font-mono">{a.event_type}</span>
                </div>
                <div className="text-sm text-white">{a.message}</div>
                <div className="text-xs text-muted mt-0.5">
                  {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                </div>
              </div>
            ))}
            {!loading && alerts.length === 0 && (
              <div className="p-5 text-muted text-sm">No active alerts</div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
