import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import StatusBadge from "../components/StatusBadge";
import { monitoringAPI, alertsAPI } from "../api";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { RefreshCw, CheckCircle, X } from "lucide-react";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

function Sparkline({ data, color = "#4f7cff" }) {
  if (!data || data.length < 2) return <span className="text-muted text-xs">—</span>;
  return (
    <ResponsiveContainer width={80} height={30}>
      <LineChart data={data}>
        <Line type="monotone" dataKey="value" stroke={color} dot={false} strokeWidth={1.5} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function MetricModal({ device, metric, onClose }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const hours = 24;

  useEffect(() => {
    setLoading(true);
    monitoringAPI.metrics(device.id, metric, hours).then((r) => {
      const pts = r.data.map((p) => ({
        value: parseFloat(p.value.toFixed(1)),
        time: format(new Date(p.timestamp), "HH:mm"),
        full: format(new Date(p.timestamp), "yyyy-MM-dd HH:mm:ss"),
      }));
      setData(pts);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [device.id, metric]);

  const color = metric === "cpu" ? "#4f7cff" : "#22c55e";
  const label = metric === "cpu" ? "CPU %" : metric === "memory" ? "Memory %" : metric === "rtt_ms" ? "RTT (ms)" : "Packet Loss %";
  const unit = metric === "rtt_ms" ? "ms" : "%";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl p-6 w-[680px] max-w-[95vw] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-white font-semibold">{device.hostname} — {label}</h2>
            <p className="text-xs text-muted mt-0.5">Last {hours} hours · {data.length} data points</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-white transition-colors"><X size={18} /></button>
        </div>

        {loading ? (
          <div className="h-64 flex items-center justify-center text-muted text-sm">Loading...</div>
        ) : data.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-muted text-sm">No data for last {hours}h</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data} margin={{ left: 0, right: 10, top: 8, bottom: 0 }}>
              <CartesianGrid stroke="#2a2d3a" vertical={false} />
              <XAxis dataKey="time" tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} unit={unit} domain={[0, metric === "rtt_ms" ? "auto" : 100]} width={42} />
              <Tooltip
                contentStyle={{ background: "#1a1d27", border: "1px solid #2a2d3a", borderRadius: 8, fontSize: 11 }}
                formatter={(v) => [`${v}${unit}`, label]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.full || ""}
              />
              <Line type="monotone" dataKey="value" stroke={color} dot={false} strokeWidth={2} activeDot={{ r: 4, fill: color }} />
            </LineChart>
          </ResponsiveContainer>
        )}

        {data.length > 0 && (
          <div className="flex gap-6 mt-3 text-xs text-muted border-t border-border pt-3">
            <span>Min: <span className="text-white">{Math.min(...data.map(d => d.value))}{unit}</span></span>
            <span>Max: <span className="text-white">{Math.max(...data.map(d => d.value))}{unit}</span></span>
            <span>Avg: <span className="text-white">{(data.reduce((s, d) => s + d.value, 0) / data.length).toFixed(1)}{unit}</span></span>
            <span>Latest: <span className="text-white">{data[data.length - 1]?.value}{unit}</span></span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Monitoring() {
  const qc = useQueryClient();
  const [metrics, setMetrics] = useState({});
  const [chart, setChart] = useState(null); // { device, metric }

  const { data: devices = [], isLoading: loading, refetch: refetchDevices } = useQuery({
    queryKey: ["monitoring"],
    queryFn: () => monitoringAPI.all().then(r => r.data),
    staleTime: 20_000,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    devices.forEach((d) => loadMetrics(d.id));
  }, [devices.length]);

  const { data: alerts = [], refetch: refetchAlerts } = useQuery({
    queryKey: ["alerts"],
    queryFn: () => alertsAPI.list().then(r => r.data),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const loadMetrics = async (deviceId) => {
    const [cpu, mem] = await Promise.all([
      monitoringAPI.metrics(deviceId, "cpu", 2),
      monitoringAPI.metrics(deviceId, "memory", 2),
    ]);
    setMetrics((m) => ({ ...m, [deviceId]: { cpu: cpu.data, mem: mem.data } }));
  };

  const load = () => { refetchDevices(); refetchAlerts(); };

  const pollDevice = async (id) => {
    toast.loading("Polling...", { id: "poll" });
    await monitoringAPI.poll(id);
    toast.success("Polled", { id: "poll" });
    qc.invalidateQueries({ queryKey: ["monitoring"] });
  };

  const resolveAlert = async (id) => {
    await alertsAPI.resolve(id);
    qc.invalidateQueries({ queryKey: ["alerts"] });
    qc.invalidateQueries({ queryKey: ["alert-count"] });
  };

  return (
    <Layout title="Monitoring">
      {chart && <MetricModal device={chart.device} metric={chart.metric} onClose={() => setChart(null)} />}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <span className="font-semibold text-white text-sm">Device Status</span>
              <button onClick={load} className="text-muted hover:text-white transition-colors">
                <RefreshCw size={13} />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border">
                  <tr>
                    {["Device","IP","Status","CPU","Memory","RTT","Loss","Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">Loading...</td></tr>
                  ) : devices.map((d) => {
                    const m = d.metrics || {};
                    const dm = metrics[d.id] || {};
                    return (
                      <tr key={d.id} className="hover:bg-white/2 transition-colors">
                        <td className="px-4 py-3 font-mono text-white">{d.hostname}</td>
                        <td className="px-4 py-3 font-mono text-muted">{d.ip_address}</td>
                        <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                        <td className="px-4 py-3 cursor-pointer group" onClick={() => setChart({ device: d, metric: "cpu" })} title="Click to view chart">
                          <div className="flex items-center gap-2">
                            <Sparkline data={dm.cpu} color={m.cpu > 90 ? "#ef4444" : "#4f7cff"} />
                            <span className="text-xs text-muted group-hover:text-accent transition-colors">
                              {m.cpu != null ? `${m.cpu.toFixed(0)}%` : "—"}
                              {m.simulated && <span className="ml-1 text-muted/50" title="Simulated">~</span>}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 cursor-pointer group" onClick={() => setChart({ device: d, metric: "memory" })} title="Click to view chart">
                          <div className="flex items-center gap-2">
                            <Sparkline data={dm.mem} color={m.memory > 90 ? "#ef4444" : "#22c55e"} />
                            <span className="text-xs text-muted group-hover:text-accent transition-colors">
                              {m.memory != null ? `${m.memory.toFixed(0)}%` : "—"}
                              {m.simulated && <span className="ml-1 text-muted/50" title="Simulated">~</span>}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-muted cursor-pointer hover:text-accent" onClick={() => setChart({ device: d, metric: "rtt_ms" })} title="Click to view chart">
                          {m.rtt_ms != null ? `${m.rtt_ms.toFixed(1)}ms` : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-muted cursor-pointer hover:text-accent" onClick={() => setChart({ device: d, metric: "packet_loss" })} title="Click to view chart">
                          {m.packet_loss != null ? `${m.packet_loss.toFixed(0)}%` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => pollDevice(d.id)}
                            className="p-1.5 text-muted hover:text-accent hover:bg-accent/10 rounded transition-colors" title="Poll now">
                            <RefreshCw size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-border">
            <span className="font-semibold text-white text-sm">Active Alerts ({alerts.length})</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {alerts.map((a) => (
              <div key={a.id} className="px-4 py-3 hover:bg-white/2 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <StatusBadge status={a.severity} />
                    <p className="text-xs text-white mt-1 truncate">{a.message}</p>
                    <p className="text-xs text-muted mt-0.5 font-mono">{a.event_type}</p>
                  </div>
                  <button onClick={() => resolveAlert(a.id)}
                    className="p-1 text-muted hover:text-green-400 transition-colors shrink-0" title="Resolve">
                    <CheckCircle size={13} />
                  </button>
                </div>
              </div>
            ))}
            {alerts.length === 0 && <div className="p-5 text-center text-muted text-sm">No active alerts</div>}
          </div>
        </div>
      </div>
    </Layout>
  );
}
