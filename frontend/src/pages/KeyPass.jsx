import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { keypassAPI } from "../api";
import { Plus, Trash2, Edit3, Eye, EyeOff, Copy, Search } from "lucide-react";
import toast from "react-hot-toast";

const CATEGORIES = ["General", "Network", "Server", "Cloud", "Database", "Application", "Personal"];

function EntryForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || {
    name: "", username: "", password: "", url: "", notes: "", tags: "", category: "General",
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}
      className="bg-surface border border-border rounded-xl p-5 mb-4 grid grid-cols-2 gap-3">
      {[["name","Name *",true],["username","Username"],["url","URL"],["tags","Tags (comma-separated)"]].map(([k,l,req]) => (
        <div key={k}>
          <label className="block text-xs text-muted mb-1">{l}</label>
          <input value={form[k] || ""} onChange={(e) => set(k, e.target.value)} required={!!req}
            className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent" />
        </div>
      ))}
      <div>
        <label className="block text-xs text-muted mb-1">Password</label>
        <input type="password" value={form.password || ""} onChange={(e) => set("password", e.target.value)}
          className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent" />
      </div>
      <div>
        <label className="block text-xs text-muted mb-1">Category</label>
        <select value={form.category || "General"} onChange={(e) => set("category", e.target.value)}
          className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent">
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="col-span-2">
        <label className="block text-xs text-muted mb-1">Notes</label>
        <textarea value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} rows={2}
          className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent resize-none" />
      </div>
      <div className="col-span-2 flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-1.5 text-sm text-muted border border-border rounded-lg">Cancel</button>
        <button type="submit" className="px-4 py-1.5 text-sm bg-accent text-white rounded-lg">Save</button>
      </div>
    </form>
  );
}

export default function KeyPass() {
  const [entries, setEntries] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [revealed, setRevealed] = useState({});
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("");

  const load = () => keypassAPI.list().then((r) => setEntries(r.data));
  useEffect(() => { load(); }, []);

  const save = async (data) => {
    if (editing) { await keypassAPI.update(editing.id, data); toast.success("Updated"); }
    else { await keypassAPI.create(data); toast.success("Entry saved securely"); }
    setShowForm(false); setEditing(null); load();
  };

  const del = async (id) => {
    if (!window.confirm("Delete this entry?")) return;
    await keypassAPI.delete(id); toast.success("Deleted"); load();
  };

  const revealPassword = async (id) => {
    if (revealed[id]) { setRevealed((r) => ({ ...r, [id]: undefined })); return; }
    const r = await keypassAPI.getPassword(id);
    setRevealed((rv) => ({ ...rv, [id]: r.data.password }));
  };

  const copyPassword = async (id) => {
    const r = await keypassAPI.getPassword(id);
    navigator.clipboard.writeText(r.data.password);
    toast.success("Password copied to clipboard");
  };

  const filtered = entries.filter((e) => {
    const q = search.toLowerCase();
    const matchQ = !q || e.name.toLowerCase().includes(q) || (e.username || "").toLowerCase().includes(q) || (e.url || "").toLowerCase().includes(q);
    const matchCat = !filterCat || e.category === filterCat;
    return matchQ && matchCat;
  });

  return (
    <Layout title="KeyPass — Password Manager">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
            className="pl-8 pr-3 py-1.5 bg-surface border border-border rounded-lg text-sm text-white focus:outline-none focus:border-accent w-52" />
        </div>
        <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}
          className="bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent">
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <button onClick={() => { setEditing(null); setShowForm(true); }}
          className="ml-auto flex items-center gap-1.5 px-4 py-1.5 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors">
          <Plus size={14} /> Add Entry
        </button>
      </div>

      {showForm && (
        <EntryForm initial={editing} onSave={save} onCancel={() => { setShowForm(false); setEditing(null); }} />
      )}

      <div className="grid gap-2">
        {filtered.map((e) => (
          <div key={e.id} className="bg-surface border border-border rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-white">{e.name}</span>
                <span className="text-xs text-muted/70 bg-muted/10 px-2 py-0.5 rounded-full">{e.category}</span>
                {e.tags && e.tags.split(",").map((t) => (
                  <span key={t} className="text-xs text-accent/70 bg-accent/10 px-2 py-0.5 rounded-full">{t.trim()}</span>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-0.5 text-xs text-muted">
                {e.username && <span className="font-mono">{e.username}</span>}
                {e.url && <a href={e.url} target="_blank" rel="noreferrer" className="truncate max-w-xs hover:text-accent">{e.url}</a>}
                {e.notes && <span className="truncate max-w-xs italic">{e.notes}</span>}
              </div>
              {revealed[e.id] && (
                <div className="mt-1 font-mono text-xs text-green-400 bg-black/30 px-2 py-1 rounded">
                  {revealed[e.id]}
                </div>
              )}
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <button onClick={() => revealPassword(e.id)}
                className="p-1.5 text-muted hover:text-accent transition-colors" title={revealed[e.id] ? "Hide" : "Reveal password"}>
                {revealed[e.id] ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
              <button onClick={() => copyPassword(e.id)}
                className="p-1.5 text-muted hover:text-accent transition-colors" title="Copy password">
                <Copy size={13} />
              </button>
              <button onClick={() => { setEditing(e); setShowForm(true); }}
                className="p-1.5 text-muted hover:text-white transition-colors" title="Edit">
                <Edit3 size={13} />
              </button>
              <button onClick={() => del(e.id)}
                className="p-1.5 text-muted hover:text-red-400 transition-colors" title="Delete">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted text-sm">No entries found</div>
        )}
      </div>
    </Layout>
  );
}
