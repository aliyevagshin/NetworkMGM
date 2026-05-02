import { useEffect, useState, useRef } from "react";
import Layout from "../components/Layout";
import { logsAPI, devicesAPI } from "../api";
import { Trash2, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useQuery } from "@tanstack/react-query";

const LEVEL_COLORS = {
  info:     "text-blue-400",
  warning:  "text-yellow-400",
  error:    "text-red-400",
  critical: "text-red-500",
  debug:    "text-muted",
};

const ROW_H = 36;

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const { data: devices = [] } = useQuery({
    queryKey: ["devices"],
    queryFn: () => devicesAPI.list().then((r) => r.data),
    staleTime: 60_000,
  });
  const [filterDevice, setFilterDevice] = useState("");
  const [filterLevel, setFilterLevel] = useState("");
  const [limit, setLimit] = useState(200);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const timerRef = useRef(null);
  const bodyRef  = useRef(null);

  const load = () =>
    logsAPI.list({ device_id: filterDevice || undefined, level: filterLevel || undefined, limit })
      .then((r) => setLogs(r.data));

  useEffect(() => {
    load();
    if (autoRefresh) timerRef.current = setInterval(load, 10_000);
    return () => clearInterval(timerRef.current);
  }, [filterDevice, filterLevel, limit, autoRefresh]);

  const clear = async () => {
    if (!window.confirm("Clear all logs?")) return;
    await logsAPI.clear();
    toast.success("Logs cleared");
    load();
  };

  const deviceName = (id) =>
    id ? devices.find((d) => d.id === id)?.hostname || `#${id}` : "System";

  const rowVirtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => bodyRef.current,
    estimateSize: () => ROW_H,
    overscan: 10,
  });

  const totalHeight  = rowVirtualizer.getTotalSize();
  const virtualItems = rowVirtualizer.getVirtualItems();

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
        <span className="text-xs text-muted">{logs.length} entries</span>

        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)}
              className="accent-accent" />
            Auto-refresh
          </label>
          <button onClick={load} className="p-1.5 text-muted hover:text-white border border-border rounded-lg">
            <RefreshCw size={13} />
          </button>
          <button onClick={clear}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 border border-red-900/50 hover:bg-red-900/20 rounded-lg transition-colors">
            <Trash2 size={12} /> Clear
          </button>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        {/* Fixed header */}
        <table className="w-full text-xs font-mono table-fixed">
          <colgroup>
            <col style={{ width: "18%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "48%" }} />
          </colgroup>
          <thead className="border-b border-border">
            <tr>
              {["Timestamp","Level","Source","Device","Message"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left font-medium text-muted">{h}</th>
              ))}
            </tr>
          </thead>
        </table>

        {/* Virtual scroll body */}
        <div ref={bodyRef} style={{ height: "65vh", overflowY: "auto" }}>
          {logs.length === 0 ? (
            <div className="px-4 py-10 text-center text-muted text-sm font-sans">No log entries found</div>
          ) : (
            <div style={{ height: totalHeight, position: "relative" }}>
              <table className="w-full text-xs font-mono table-fixed" style={{ position: "absolute", top: 0, left: 0, width: "100%" }}>
                <colgroup>
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "48%" }} />
                </colgroup>
                <tbody>
                  {virtualItems.length > 0 && virtualItems[0].start > 0 && (
                    <tr style={{ height: virtualItems[0].start }} />
                  )}
                  {virtualItems.map((vRow) => {
                    const l = logs[vRow.index];
                    return (
                      <tr key={l.id} className="hover:bg-white/2 transition-colors border-b border-border/30" style={{ height: ROW_H }}>
                        <td className="px-3 py-1 text-muted whitespace-nowrap">
                          {format(new Date(l.timestamp), "yyyy-MM-dd HH:mm:ss")}
                        </td>
                        <td className={`px-3 py-1 uppercase font-bold ${LEVEL_COLORS[l.level] || "text-white"}`}>
                          {l.level}
                        </td>
                        <td className="px-3 py-1 text-muted">{l.source}</td>
                        <td className="px-3 py-1 text-white truncate">{deviceName(l.device_id)}</td>
                        <td className="px-3 py-1 text-white truncate">{l.message}</td>
                      </tr>
                    );
                  })}
                  {virtualItems.length > 0 && (() => {
                    const last = virtualItems[virtualItems.length - 1];
                    const rem = totalHeight - last.end;
                    return rem > 0 ? <tr style={{ height: rem }} /> : null;
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
