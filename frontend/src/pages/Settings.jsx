import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { settingsAPI, auditAPI } from "../api";
import { Save } from "lucide-react";
import toast from "react-hot-toast";
import { format } from "date-fns";

export default function Settings() {
  const [settings, setSettings] = useState([]);
  const [audit, setAudit] = useState([]);
  const [tab, setTab] = useState("settings");
  const [form, setForm] = useState({});

  useEffect(() => {
    settingsAPI.get().then((r) => {
      setSettings(r.data);
      const f = {};
      r.data.forEach((s) => { f[s.key] = s.value; });
      setForm(f);
    });
    auditAPI.list(200).then((r) => setAudit(r.data));
  }, []);

  const save = async () => {
    await settingsAPI.update(form);
    toast.success("Settings saved");
  };

  return (
    <Layout title="Settings">
      <div className="flex gap-2 mb-4">
        {["settings", "audit"].map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${tab === t ? "bg-accent text-white" : "text-muted border border-border hover:text-white"}`}>
            {t === "settings" ? "System Settings" : "Audit Log"}
          </button>
        ))}
      </div>

      {tab === "settings" && (
        <div className="bg-surface border border-border rounded-xl p-5 max-w-lg">
          <div className="space-y-4">
            {settings.map((s) => (
              <div key={s.key}>
                <label className="block text-xs text-muted mb-1.5">
                  {s.key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  {s.description && <span className="ml-1 text-muted/60">— {s.description}</span>}
                </label>
                <input
                  value={form[s.key] || ""}
                  onChange={(e) => setForm((f) => ({ ...f, [s.key]: e.target.value }))}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
                />
              </div>
            ))}
          </div>
          <button onClick={save}
            className="mt-5 flex items-center gap-2 px-4 py-2 bg-accent text-white text-sm rounded-lg transition-colors hover:bg-accent/90">
            <Save size={13} /> Save Settings
          </button>
        </div>
      )}

      {tab === "audit" && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-border">
                <tr>
                  {["Timestamp","User","Action","Target","Details","IP"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-medium text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {audit.map((a) => (
                  <tr key={a.id} className="hover:bg-white/2 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-muted whitespace-nowrap">
                      {format(new Date(a.timestamp), "yyyy-MM-dd HH:mm:ss")}
                    </td>
                    <td className="px-4 py-2.5 text-white">{a.user}</td>
                    <td className="px-4 py-2.5 font-mono text-accent">{a.action}</td>
                    <td className="px-4 py-2.5 font-mono text-muted">{a.target}</td>
                    <td className="px-4 py-2.5 text-muted max-w-xs truncate">{a.details || "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-muted">{a.ip_address || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  );
}
