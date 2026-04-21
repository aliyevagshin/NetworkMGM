import { useEffect, useState, useRef } from "react";
import Layout from "../components/Layout";
import { logsAPI, devicesAPI } from "../api";
import { Trash2, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { format } from "date-fns";

const LEVEL_COLORS = {
  info: "text-blue-400",
  warning: "text-yellow-400",
  error: "text-red-400",
  critical: "text-red-500",
  debug: "text-muted",
};

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [devices, setDevices] = useState([]);
  const [filterDevice, setFilterDevice] = useState("");
  const [filterLevel, setFilterLevel] = useState("");
  const [limit, setLimit] = useState(200);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const timerRef = useRef(null);

  const load = () =>
    logsAPI.list({ device_id: filterDevice || undefined, level: filterLevel || undefined, limit }).then((r) =>
      setLogs(r.data)
    );

  useEffect(() => {
    devicesAPI.list().then((r) => setDevices(r.data));
  }, []);

  useEffect(() => {
    load();
    if (autoRefresh) {
      timerRef.current = setInterval(load, 10000);
    }
    return () => clearInterval(timerRef.current);
  }, [filterDevice, filterLevel, limit, autoRefresh]);

  const clear = async () => {
    if (!window.confirm("Clear all logs?")) return;
    await logsAPI.clear();
    toast.success("Logs cleared");
    load();
  };

  const deviceName = (id) => id ? devices.find((d) => d.id === id)?.hostname || `#${id}` : "System";

  return (
    <Layout title="System Logs">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <select value={filterDevice} onChange={(e) => setFilterDevice(e.target.value)}
          className="bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent">
          <option value="">All Devices</option>
          {devices.map((d) => <option key={d.id} value={d.id}>{d.hostname}</option>)}
        </select>
        <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)}
          className="bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent">
          <option value="">All Levels</option>
          {["debug","info","warning","error","critical"].map((l) => (
            <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
          ))}
        </select>
        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}
          className="bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent">
          {[50,100,200,500].map((n) => <option key={n} value={n}>Last {n}</option>)}
        </select>

        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)}
              className="accent-accent" />
            Auto-refresh
          </label>
          <button onClick={load}
            className="p-1.5 text-muted hover:text-white border border-border rounded-lg">
            <RefreshCw size={13} />
          </button>
          <button onClick={clear}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 border border-red-900/50 hover:bg-red-900/20 rounded-lg transition-colors">
            <Trash2 size={12} /> Clear
          </button>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="overflow-auto max-h-[72vh]">
          <table className="w-full text-xs font-mono">
            <thead className="border-b border-border sticky top-0 bg-surface">
              <tr>
                {["Timestamp","Level","Source","Device","Message"].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left font-medium text-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-white/2 transition-colors">
                  <td className="px-3 py-1.5 text-muted whitespace-nowrap">
                    {format(new Date(l.timestamp), "yyyy-MM-dd HH:mm:ss")}
                  </td>
                  <td className={`px-3 py-1.5 uppercase font-bold ${LEVEL_COLORS[l.level] || "text-white"}`}>
                    {l.level}
                  </td>
                  <td className="px-3 py-1.5 text-muted">{l.source}</td>
                  <td className="px-3 py-1.5 text-white">{deviceName(l.device_id)}</td>
                  <td className="px-3 py-1.5 text-white max-w-xl truncate">{l.message}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted">No log entries found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
