import { useState, useEffect, useRef, useCallback } from "react";
import Layout from "../components/Layout";
import StatusBadge from "../components/StatusBadge";
import { monitoringAPI, alertsAPI } from "../api";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { RefreshCw, CheckCircle, X, Wifi } from "lucide-react";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { format } from "date-fns";
import { useMonitoringSSE } from "../hooks/useSSE";

function Sparkline({ data, color = "#4f7cff" }) {
  if (!data || data.length < 2) return <span className="text-xs text-muted">—</span>;
  return (
    <LineChart width={80} height={28} data={data}>
      <Line type="monotone" dataKey="value" stroke={color} dot={false} strokeWidth={1.5} />
    </LineChart>
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
  const unit  = metric === "rtt_ms" ? "ms" : "%";

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

const ROW_HEIGHT = 48;

export default function Monitoring() {
  const qc = useQueryClient();
  const [sparklines, setSparklines]   = useState({});
  const [chart, setChart]             = useState(null);
  const [liveDevices, setLiveDevices] = useState(null);  // SSE-updated device list
  const [sseActive, setSseActive]     = useState(false);
  const tableRef = useRef(null);

  // Initial load via React Query; SSE keeps it fresh afterwards
  const { data: fetchedDevices = [], isLoading, refetch: refetchDevices } = useQuery({
    queryKey: ["monitoring"],
    queryFn: () => monitoringAPI.all().then(r => r.data),
    staleTime: 60_000,
    refetchInterval: false,  // SSE drives updates — no polling needed
  });

  const { data: alerts = [], refetch: refetchAlerts } = useQuery({
    queryKey: ["alerts"],
    queryFn: () => alertsAPI.list().then(r => r.data),
    staleTime: 30_000,
    refetchInterval: false,
  });

  // SSE: push updates directly into state, no HTTP polling
  const handleSSE = useCallback((payload) => {
    if (payload.type === "devices") {
      setSseActive(true);
      setLiveDevices(payload.data);
      // Sync React Query cache so other pages see fresh data too
      qc.setQueryData(["monitoring"], payload.data);
    }
  }, [qc]);
  useMonitoringSSE(handleSSE);

  const devices = liveDevices ?? fetchedDevices;

  // Load sparklines in batches as devices arrive
  useEffect(() => {
    if (!devices.length) return;
    const missing = devices.filter(d => !sparklines[d.id]);
    if (!missing.length) return;
    // Batch: load 10 at a time to avoid flooding
    const batch = missing.slice(0, 10);
    batch.forEach(d => {
      Promise.all([
        monitoringAPI.metrics(d.id, "cpu", 2),
        monitoringAPI.metrics(d.id, "memory", 2),
      ]).then(([cpu, mem]) => {
        setSparklines(prev => ({ ...prev, [d.id]: { cpu: cpu.data, mem: mem.data } }));
      }).catch(() => {});
    });
  }, [devices.length, sparklines]);

  // Virtual scroll for device table
  const rowVirtualizer = useVirtualizer({
    count: devices.length,
    getScrollElement: () => tableRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  const load = () => { refetchDevices(); refetchAlerts(); setLiveDevices(null); };

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

  const totalHeight = rowVirtualizer.getTotalSize();
  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <Layout title="Monitoring">
      {chart && <MetricModal device={chart.device} metric={chart.metric} onClose={() => setChart(null)} />}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <div className="bg-surface border border-border rounded-xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white text-sm">
                  Device Status {devices.length > 0 && <span className="text-muted font-normal">({devices.length})</span>}
                </span>
                {sseActive && (
                  <span className="flex items-center gap-1 text-[10px] text-green-400 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"/>
                    live
                  </span>
                )}
              </div>
              <button onClick={load} className="text-muted hover:text-white transition-colors">
                <RefreshCw size={13} />
              </button>
            </div>

            {/* Fixed header */}
            <div className="overflow-x-auto shrink-0">
              <table className="w-full text-sm table-fixed" style={{ minWidth: 640 }}>
                <colgroup>
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "6%" }} />
                </colgroup>
                <thead className="border-b border-border">
                  <tr>
                    {["Device","IP","Status","CPU","Memory","RTT","Loss",""].map((h, i) => (
                      <th key={i} className="px-3 py-3 text-left text-xs font-medium text-muted">{h}</th>
                    ))}
                  </tr>
                </thead>
              </table>
            </div>

            {/* Virtualised body */}
            <div
              ref={tableRef}
              className="overflow-y-auto overflow-x-auto"
              style={{ height: Math.min(devices.length * ROW_HEIGHT + 2, 480) || 120 }}
            >
              {isLoading ? (
                <div className="px-4 py-8 text-center text-muted text-sm">Loading...</div>
              ) : (
                <div style={{ height: totalHeight, position: "relative" }}>
                  <table className="w-full text-sm table-fixed" style={{ minWidth: 640 }}>
                    <colgroup>
                      <col style={{ width: "18%" }} />
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "10%" }} />
                      <col style={{ width: "16%" }} />
                      <col style={{ width: "16%" }} />
                      <col style={{ width: "10%" }} />
                      <col style={{ width: "10%" }} />
                      <col style={{ width: "6%" }} />
                    </colgroup>
                    <tbody>
                      {/* spacer top */}
                      {virtualItems.length > 0 && virtualItems[0].start > 0 && (
                        <tr style={{ height: virtualItems[0].start }} />
                      )}
                      {virtualItems.map((vRow) => {
                        const d = devices[vRow.index];
                        const m = d.metrics || {};
                        const dm = sparklines[d.id] || {};
                        return (
                          <tr key={d.id} className="hover:bg-white/2 transition-colors border-b border-border/50" style={{ height: ROW_HEIGHT }}>
                            <td className="px-3 py-2 font-mono text-white text-xs truncate">{d.hostname}</td>
                            <td className="px-3 py-2 font-mono text-muted text-xs truncate">{d.ip_address}</td>
                            <td className="px-3 py-2"><StatusBadge status={d.status} /></td>
                            <td className="px-3 py-2 cursor-pointer group" onClick={() => setChart({ device: d, metric: "cpu" })} title="Click to chart">
                              <div className="flex items-center gap-1.5">
                                <Sparkline data={dm.cpu} color={m.cpu > 90 ? "#ef4444" : "#4f7cff"} />
                                <span className="text-xs text-muted group-hover:text-accent">
                                  {m.cpu != null ? `${m.cpu.toFixed(0)}%` : "—"}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2 cursor-pointer group" onClick={() => setChart({ device: d, metric: "memory" })} title="Click to chart">
                              <div className="flex items-center gap-1.5">
                                <Sparkline data={dm.mem} color={m.memory > 90 ? "#ef4444" : "#22c55e"} />
                                <span className="text-xs text-muted group-hover:text-accent">
                                  {m.memory != null ? `${m.memory.toFixed(0)}%` : "—"}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-xs font-mono text-muted cursor-pointer hover:text-accent" onClick={() => setChart({ device: d, metric: "rtt_ms" })}>
                              {m.rtt_ms != null ? `${m.rtt_ms.toFixed(1)}ms` : "—"}
                            </td>
                            <td className="px-3 py-2 text-xs font-mono text-muted cursor-pointer hover:text-accent" onClick={() => setChart({ device: d, metric: "packet_loss" })}>
                              {m.packet_loss != null ? `${m.packet_loss.toFixed(0)}%` : "—"}
                            </td>
                            <td className="px-3 py-2">
                              <button onClick={() => pollDevice(d.id)}
                                className="p-1 text-muted hover:text-accent hover:bg-accent/10 rounded transition-colors" title="Poll now">
                                <RefreshCw size={11} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {/* spacer bottom */}
                      {virtualItems.length > 0 && (() => {
                        const last = virtualItems[virtualItems.length - 1];
                        const remaining = totalHeight - last.end;
                        return remaining > 0 ? <tr style={{ height: remaining }} /> : null;
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-border shrink-0">
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
