import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { vaultAPI } from "../api";
import { Plus, Trash2, Edit3, Eye, Copy } from "lucide-react";
import toast from "react-hot-toast";

function CredForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || {
    name: "", username: "", password: "", enable_pass: "", tags: "", ssh_key_path: "",
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}
      className="grid grid-cols-2 gap-3 bg-surface border border-border rounded-xl p-4 mb-4">
      {[["name","Name",true],["username","Username",true],["password","Password"],["enable_pass","Enable Password"],["tags","Tags (comma-separated)"],["ssh_key_path","SSH Key Path"]].map(([k,l,req]) => (
        <div key={k}>
          <label className="block text-xs text-muted mb-1">{l}</label>
          <input
            type={["password","enable_pass"].includes(k) ? "password" : "text"}
            required={!!req}
            value={form[k]}
            onChange={(e) => set(k, e.target.value)}
            className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
          />
        </div>
      ))}
      <div className="col-span-2 flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-1.5 text-sm text-muted border border-border rounded-lg">Cancel</button>
        <button type="submit" className="px-4 py-1.5 text-sm bg-accent text-white rounded-lg">Save</button>
      </div>
    </form>
  );
}

export default function Vault() {
  const [creds, setCreds] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [revealed, setRevealed] = useState({});

  const load = () => vaultAPI.list().then((r) => setCreds(r.data));
  useEffect(() => { load(); }, []);

  const save = async (data) => {
    if (editing) { await vaultAPI.update(editing.id, data); toast.success("Updated"); }
    else { await vaultAPI.create(data); toast.success("Credential stored securely"); }
    setShowForm(false); setEditing(null); load();
  };

  const del = async (id) => {
    if (!confirm("Delete credential?")) return;
    await vaultAPI.delete(id);
    toast.success("Deleted"); load();
  };

  const reveal = async (id) => {
    const res = await vaultAPI.getPassword(id);
    setRevealed((r) => ({ ...r, [id]: res.data.password }));
    setTimeout(() => setRevealed((r) => { const n = { ...r }; delete n[id]; return n; }), 10000);
  };

  const copy = async (id) => {
    const res = await vaultAPI.copy(id);
    await navigator.clipboard.writeText(res.data.password);
    toast.success("Password copied (audited)");
  };

  return (
    <Layout title="Vault">
      <div className="flex justify-end mb-4">
        <button onClick={() => { setShowForm(true); setEditing(null); }}
          className="flex items-center gap-2 px-4 py-1.5 bg-accent text-white text-sm rounded-lg">
          <Plus size={14} /> Add Credential
        </button>
      </div>

      {(showForm || editing) && (
        <CredForm initial={editing} onSave={save} onCancel={() => { setShowForm(false); setEditing(null); }} />
      )}

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr>
              {["Name","Username","Tags","Password","Actions"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {creds.map((c) => (
              <tr key={c.id} className="hover:bg-white/2 transition-colors">
                <td className="px-4 py-2.5 text-white font-medium">{c.name}</td>
                <td className="px-4 py-2.5 font-mono text-muted">{c.username}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {(c.tags || "").split(",").filter(Boolean).map((t) => (
                      <span key={t} className="px-1.5 py-0.5 bg-accent/10 text-accent text-xs rounded font-mono">{t.trim()}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5 font-mono text-sm">
                  {revealed[c.id] ? (
                    <span className="text-green-400">{revealed[c.id]}</span>
                  ) : (
                    <span className="text-muted tracking-widest">••••••••</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1">
                    <button onClick={() => reveal(c.id)} title="Reveal (10s)"
                      className="p-1.5 text-muted hover:text-amber-400 rounded transition-colors"><Eye size={13} /></button>
                    <button onClick={() => copy(c.id)} title="Copy to clipboard"
                      className="p-1.5 text-muted hover:text-accent rounded transition-colors"><Copy size={13} /></button>
                    <button onClick={() => setEditing(c)}
                      className="p-1.5 text-muted hover:text-white rounded transition-colors"><Edit3 size={13} /></button>
                    <button onClick={() => del(c.id)}
                      className="p-1.5 text-muted hover:text-red-400 rounded transition-colors"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {creds.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted text-sm">No credentials stored</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
