import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { backupsAPI, devicesAPI } from "../api";
import { Download, Eye, RotateCcw, ChevronDown, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";
import { format } from "date-fns";
import api from "../api";

export default function Backup() {
  const [devices, setDevices] = useState([]);
  const [backups, setBackups] = useState([]);
  const [filterDevice, setFilterDevice] = useState("");
  const [viewing, setViewing] = useState(null);
  const [viewContent, setViewContent] = useState("");

  const load = () => {
    devicesAPI.list().then((r) => setDevices(r.data));
    backupsAPI.list(filterDevice || undefined).then((r) => setBackups(r.data));
  };

  useEffect(() => { load(); }, [filterDevice]);

  const deviceName = (id) => devices.find((d) => d.id === id)?.hostname || `Device ${id}`;

  const viewBackup = async (b) => {
    try {
      const r = await api.get(`/backups/${b.id}/view`);
      setViewContent(r.data.content);
      setViewing(b);
    } catch {
      toast.error("Failed to load backup content");
    }
  };

  const restore = async (b) => {
    if (!window.confirm(`Restore backup to ${deviceName(b.device_id)}?`)) return;
    try {
      const r = await backupsAPI.restore(b.device_id, b.id);
      if (r.data.success) toast.success("Restore initiated");
      else toast.error(r.data.error || "Restore failed");
    } catch {
      toast.error("Restore failed");
    }
  };

  const fmt = (bytes) => bytes > 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;

  return (
    <Layout title="Config Backups">
      <div className="flex items-center gap-3 mb-4">
        <select
          value={filterDevice}
          onChange={(e) => setFilterDevice(e.target.value)}
          className="bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
        >
          <option value="">All Devices</option>
          {devices.map((d) => <option key={d.id} value={d.id}>{d.hostname}</option>)}
        </select>
        <span className="text-sm text-muted ml-auto">{backups.length} backups</span>
      </div>

      {viewing ? (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm text-white font-medium">
              {deviceName(viewing.device_id)} — {format(new Date(viewing.created_at), "yyyy-MM-dd HH:mm:ss")}
            </span>
            <button onClick={() => setViewing(null)} className="text-xs text-muted hover:text-white px-3 py-1 border border-border rounded-lg">
              Close
            </button>
          </div>
          <pre className="p-4 text-xs font-mono text-green-400 bg-black overflow-auto max-h-[60vh] whitespace-pre-wrap">
            {viewContent}
          </pre>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr>
                  {["Device", "Created At", "Size", "Triggered By", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {backups.map((b) => (
                  <tr key={b.id} className="hover:bg-white/2 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-white">{deviceName(b.device_id)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted">
                      {format(new Date(b.created_at), "yyyy-MM-dd HH:mm:ss")}
                    </td>
                    <td className="px-4 py-2.5 text-muted text-xs">{fmt(b.file_size || 0)}</td>
                    <td className="px-4 py-2.5 text-muted text-xs capitalize">{b.triggered_by || "manual"}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        <button onClick={() => viewBackup(b)}
                          className="p-1.5 text-muted hover:text-accent transition-colors" title="View">
                          <Eye size={13} />
                        </button>
                        <a href={backupsAPI.download(b.id)} download
                          className="p-1.5 text-muted hover:text-accent transition-colors" title="Download">
                          <Download size={13} />
                        </a>
                        <button onClick={() => restore(b)}
                          className="p-1.5 text-muted hover:text-warning transition-colors" title="Restore">
                          <RotateCcw size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {backups.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted text-sm">No backups found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  );
}
