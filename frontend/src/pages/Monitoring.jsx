import { useState } from "react";
import Layout from "../components/Layout";
import StatusBadge from "../components/StatusBadge";
import { monitoringAPI, alertsAPI } from "../api";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { RefreshCw, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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

export default function Monitoring() {
  const qc = useQueryClient();
  const [metrics, setMetrics] = useState({});

  const { data: devices = [], isLoading: loading, refetch: refetchDevices } = useQuery({
    queryKey: ["monitoring"],
    queryFn: () => monitoringAPI.all().then(r => r.data),
    staleTime: 20_000,
    refetchInterval: 30_000,
    onSuccess: (data) => data.forEach((d) => loadMetrics(d.id)),
  });

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
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Sparkline data={dm.cpu} color={m.cpu > 90 ? "#ef4444" : "#4f7cff"} />
                            <span className="text-xs text-muted">
                              {m.cpu != null ? `${m.cpu.toFixed(0)}%` : "—"}
                              {m.simulated && <span className="ml-1 text-muted/50" title="Simulated">~</span>}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Sparkline data={dm.mem} color={m.memory > 90 ? "#ef4444" : "#22c55e"} />
                            <span className="text-xs text-muted">
                              {m.memory != null ? `${m.memory.toFixed(0)}%` : "—"}
                              {m.simulated && <span className="ml-1 text-muted/50" title="Simulated">~</span>}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-muted">{m.rtt_ms != null ? `${m.rtt_ms.toFixed(1)}ms` : "—"}</td>
                        <td className="px-4 py-3 text-xs font-mono text-muted">{m.packet_loss != null ? `${m.packet_loss.toFixed(0)}%` : "—"}</td>
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
