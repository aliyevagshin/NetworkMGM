import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { settingsAPI, auditAPI, usersAPI, ldapAPI } from "../api";
import { Save, Plus, Trash2, Edit3, UserCheck, Search } from "lucide-react";
import toast from "react-hot-toast";
import { format } from "date-fns";

const TABS = ["settings", "users", "ldap", "audit"];
const TAB_LABELS = { settings: "System Settings", users: "Users", ldap: "LDAP / AD", audit: "Audit Log" };

/* ─── Users Tab ─── */
function UsersTab() {
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ username: "", password: "", role: "operator" });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const load = () => usersAPI.list().then((r) => setUsers(r.data));
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    if (editing) { await usersAPI.update(editing.id, form); toast.success("User updated"); }
    else { await usersAPI.create(form); toast.success("User created"); }
    setShowForm(false); setEditing(null); load();
  };

  const del = async (id) => {
    if (!window.confirm("Delete user?")) return;
    await usersAPI.delete(id); toast.success("Deleted"); load();
  };

  return (
    <div>
      <button onClick={() => { setEditing(null); setForm({ username: "", password: "", role: "operator" }); setShowForm(true); }}
        className="mb-3 flex items-center gap-1.5 px-4 py-1.5 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors">
        <Plus size={13} /> Add User
      </button>
      {showForm && (
        <form onSubmit={save} className="bg-surface border border-border rounded-xl p-4 mb-4 grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-muted mb-1">Username *</label>
            <input value={form.username} onChange={(e) => set("username", e.target.value)} required
              className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent" />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Password {editing && "(leave blank to keep)"}</label>
            <input type="password" value={form.password || ""} onChange={(e) => set("password", e.target.value)}
              className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent" />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Role</label>
            <select value={form.role} onChange={(e) => set("role", e.target.value)}
              className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent">
              <option value="admin">Admin</option>
              <option value="operator">Operator</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <div className="col-span-3 flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-1.5 text-sm text-muted border border-border rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-1.5 text-sm bg-accent text-white rounded-lg">Save</button>
          </div>
        </form>
      )}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr>
              {["Username","Role","Actions"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-white/2 transition-colors">
                <td className="px-4 py-2.5 font-mono text-white">{u.username}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${u.role === "admin" ? "bg-accent/20 text-accent" : "bg-white/10 text-muted"}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setEditing(u); setForm({ username: u.username, password: "", role: u.role }); setShowForm(true); }}
                      className="p-1.5 text-muted hover:text-white transition-colors"><Edit3 size={12}/></button>
                    <button onClick={() => del(u.id)}
                      className="p-1.5 text-muted hover:text-red-400 transition-colors"><Trash2 size={12}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── LDAP Tab ─── */
function LDAPTab() {
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState({});
  const [testUser, setTestUser] = useState("");
  const [testPass, setTestPass] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    ldapAPI.get().then((r) => { setCfg(r.data); setForm(r.data); });
  }, []);

  const save = async () => {
    await ldapAPI.update(form); toast.success("LDAP config saved");
  };

  const testConn = async () => {
    const r = await ldapAPI.test(testUser, testPass);
    if (r.data.success) toast.success(`LDAP OK — DN: ${r.data.dn}`);
    else toast.error(r.data.error || "LDAP test failed");
  };

  if (!cfg) return <div className="text-muted text-sm">Loading...</div>;

  return (
    <div className="max-w-lg space-y-4">
      <div className="bg-surface border border-border rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-sm font-semibold text-white">LDAP / Active Directory</span>
          <label className="flex items-center gap-2 ml-auto text-xs text-muted cursor-pointer">
            <input type="checkbox" checked={form.enabled || false} onChange={(e) => set("enabled", e.target.checked)} className="accent-accent" />
            Enabled
          </label>
        </div>
        {[["server","LDAP Server"],["port","Port"],["base_dn","Base DN"],["bind_dn","Bind DN"],["user_search_filter","User Search Filter"]].map(([k,l]) => (
          <div key={k}>
            <label className="block text-xs text-muted mb-1">{l}</label>
            <input value={form[k] || ""} onChange={(e) => set(k, e.target.value)}
              className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent" />
          </div>
        ))}
        <div>
          <label className="block text-xs text-muted mb-1">Bind Password</label>
          <input type="password" value={form.bind_password || ""} onChange={(e) => set("bind_password", e.target.value)}
            placeholder="Leave blank to keep existing"
            className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent" />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Default Role</label>
          <select value={form.default_role || "operator"} onChange={(e) => set("default_role", e.target.value)}
            className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent">
            <option value="admin">Admin</option>
            <option value="operator">Operator</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
          <input type="checkbox" checked={form.use_ssl || false} onChange={(e) => set("use_ssl", e.target.checked)} className="accent-accent" />
          Use SSL / LDAPS
        </label>
        <button onClick={save} className="flex items-center gap-2 px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors">
          <Save size={13} /> Save LDAP Config
        </button>
      </div>

      <div className="bg-surface border border-border rounded-xl p-5 space-y-3">
        <div className="text-sm font-semibold text-white">Test LDAP Login</div>
        <div className="grid grid-cols-2 gap-3">
          <input value={testUser} onChange={(e) => setTestUser(e.target.value)} placeholder="Test username"
            className="bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent" />
          <input type="password" value={testPass} onChange={(e) => setTestPass(e.target.value)} placeholder="Password"
            className="bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent" />
        </div>
        <button onClick={testConn} className="flex items-center gap-2 px-4 py-1.5 text-sm bg-white/10 hover:bg-white/15 text-white rounded-lg transition-colors">
          <UserCheck size={13} /> Test Connection
        </button>
      </div>
    </div>
  );
}

/* ─── Main Settings Page ─── */
export default function Settings() {
  const [settings, setSettings] = useState([]);
  const [audit, setAudit] = useState([]);
  const [tab, setTab] = useState("settings");
  const [form, setForm] = useState({});
  const [auditFilter, setAuditFilter] = useState({ user: "", action: "", target: "" });

  useEffect(() => {
    settingsAPI.get().then((r) => {
      setSettings(r.data);
      const f = {};
      r.data.forEach((s) => { f[s.key] = s.value; });
      setForm(f);
    });
  }, []);

  useEffect(() => {
    if (tab === "audit") {
      const p = {};
      if (auditFilter.user) p.user = auditFilter.user;
      if (auditFilter.action) p.action = auditFilter.action;
      if (auditFilter.target) p.target = auditFilter.target;
      auditAPI.list(p).then((r) => setAudit(r.data));
    }
  }, [tab, auditFilter]);

  const save = async () => {
    await settingsAPI.update(form);
    toast.success("Settings saved");
  };

  return (
    <Layout title="Settings">
      <div className="flex gap-2 mb-4 flex-wrap">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${tab === t ? "bg-accent text-white" : "text-muted border border-border hover:text-white"}`}>
            {TAB_LABELS[t]}
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

      {tab === "users" && <UsersTab />}
      {tab === "ldap" && <LDAPTab />}

      {tab === "audit" && (
        <div>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {[["user","User"],["action","Action"],["target","Target"]].map(([k,l]) => (
              <div key={k} className="relative">
                <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  value={auditFilter[k]}
                  onChange={(e) => setAuditFilter((f) => ({ ...f, [k]: e.target.value }))}
                  placeholder={`Filter ${l}…`}
                  className="pl-7 pr-3 py-1.5 bg-surface border border-border rounded-lg text-xs text-white focus:outline-none focus:border-accent w-40"
                />
              </div>
            ))}
            {(auditFilter.user || auditFilter.action || auditFilter.target) && (
              <button onClick={() => setAuditFilter({ user: "", action: "", target: "" })}
                className="text-xs text-muted hover:text-white px-2 py-1.5 border border-border rounded-lg">
                Clear
              </button>
            )}
            <span className="text-xs text-muted ml-auto">{audit.length} records · auto-deleted after 7 days</span>
          </div>
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
        </div>
      )}
    </Layout>
  );
}
