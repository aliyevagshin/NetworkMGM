import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import StatusBadge from "../components/StatusBadge";
import { devicesAPI, vaultAPI } from "../api";
import { Plus, Trash2, Edit3, Wifi, Download, ChevronDown, ChevronUp, Cpu } from "lucide-react";
import toast from "react-hot-toast";

const DEVICE_TYPES = ["router", "switch", "firewall", "ap", "server", "other"];
const VENDORS = ["cisco", "cisco-asa", "mikrotik", "fortinet", "paloalto", "checkpoint", "juniper", "hp", "ubiquiti", "other"];

function DeviceForm({ initial, onSave, onCancel, vaultCreds }) {
  const [form, setForm] = useState(
    initial || {
      hostname: "", ip_address: "", ssh_port: 22, device_type: "router",
      vendor: "cisco", os_version: "", location: "", snmp_community: "",
      snmp_version: "v2c", vault_credential_id: "",
    }
  );
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { ...form };
    if (!data.vault_credential_id) delete data.vault_credential_id;
    else data.vault_credential_id = parseInt(data.vault_credential_id);
    onSave(data);
  };

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
      {[
        ["hostname", "Hostname", "text"],
        ["ip_address", "IP Address", "text"],
        ["ssh_port", "SSH Port", "number"],
        ["os_version", "OS Version", "text"],
        ["location", "Location", "text"],
        ["snmp_community", "SNMP Community", "text"],
      ].map(([k, label, type]) => (
        <div key={k}>
          <label className="block text-xs text-muted mb-1">{label}</label>
          <input
            type={type}
            value={form[k]}
            onChange={(e) => set(k, e.target.value)}
            className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
          />
        </div>
      ))}
      <div>
        <label className="block text-xs text-muted mb-1">Device Type</label>
        <select value={form.device_type} onChange={(e) => set("device_type", e.target.value)}
          className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent">
          {DEVICE_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs text-muted mb-1">Vendor</label>
        <select value={form.vendor} onChange={(e) => set("vendor", e.target.value)}
          className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent">
          {VENDORS.map((v) => <option key={v}>{v}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs text-muted mb-1">SNMP Version</label>
        <select value={form.snmp_version} onChange={(e) => set("snmp_version", e.target.value)}
          className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent">
          <option value="v1">v1</option>
          <option value="v2c">v2c</option>
          <option value="v3">v3</option>
        </select>
      </div>
      <div>
        <label className="block text-xs text-muted mb-1">Vault Credential</label>
        <select value={form.vault_credential_id || ""} onChange={(e) => set("vault_credential_id", e.target.value)}
          className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent">
          <option value="">None</option>
          {vaultCreds.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.username})</option>)}
        </select>
      </div>
      <div className="col-span-2 flex gap-2 justify-end mt-2">
        <button type="button" onClick={onCancel} className="px-4 py-1.5 text-sm text-muted hover:text-white border border-border rounded-lg transition-colors">Cancel</button>
        <button type="submit" className="px-4 py-1.5 text-sm bg-accent hover:bg-accent/90 text-white rounded-lg transition-colors">Save</button>
      </div>
    </form>
  );
}

export default function DeviceHub() {
  const [devices, setDevices] = useState([]);
  const [vaultCreds, setVaultCreds] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState("hostname");
  const [sortDir, setSortDir] = useState(1);
  const [filter, setFilter] = useState("");

  const load = () => {
    Promise.all([devicesAPI.list(), vaultAPI.list()]).then(([d, v]) => {
      setDevices(d.data);
      setVaultCreds(v.data);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (data) => {
    await devicesAPI.create(data);
    toast.success("Device created");
    setShowForm(false);
    load();
  };

  const handleUpdate = async (data) => {
    await devicesAPI.update(editing.id, data);
    toast.success("Device updated");
    setEditing(null);
    load();
  };

  const handleDelete = async (id, hostname) => {
    if (!confirm(`Delete ${hostname}?`)) return;
    await devicesAPI.delete(id);
    toast.success("Deleted");
    load();
  };

  const handleTestSSH = async (id) => {
    const res = await devicesAPI.testSSH(id);
    if (res.data.success) toast.success("SSH OK");
    else toast.error(`SSH failed: ${res.data.error}`);
    load();
  };

  const handlePullConfig = async (id) => {
    toast.loading("Pulling config...", { id: "pull" });
    const res = await devicesAPI.pullConfig(id);
    if (res.data.success) toast.success("Config pulled", { id: "pull" });
    else toast.error(`Failed: ${res.data.error}`, { id: "pull" });
  };

  const handleAutoDetect = async (id) => {
    toast.loading("Auto-detecting...", { id: `detect-${id}` });
    const res = await devicesAPI.autoDetect(id);
    if (res.data.success) {
      toast.success(`OS: ${res.data.os_version || "?"} · Serial: ${res.data.serial || "?"}`, { id: `detect-${id}` });
      load();
    } else {
      toast.error(res.data.error || "Detection failed", { id: `detect-${id}` });
    }
  };

  const sort = (key) => {
    if (sortKey === key) setSortDir((d) => -d);
    else { setSortKey(key); setSortDir(1); }
  };

  const sorted = [...devices]
    .filter((d) => !filter || d.hostname.includes(filter) || d.ip_address.includes(filter))
    .sort((a, b) => (a[sortKey] > b[sortKey] ? 1 : -1) * sortDir);

  const SortIcon = ({ k }) => sortKey === k ? (sortDir > 0 ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null;

  return (
    <Layout title="Devices">
      <div className="flex items-center justify-between mb-4">
        <input
          placeholder="Search hostname / IP..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-white w-56 focus:outline-none focus:border-accent"
        />
        <button onClick={() => { setShowForm(true); setEditing(null); }}
          className="flex items-center gap-2 px-4 py-1.5 bg-accent hover:bg-accent/90 text-white text-sm rounded-lg transition-colors">
          <Plus size={14} /> Add Device
        </button>
      </div>

      {(showForm || editing) && (
        <div className="bg-surface border border-border rounded-xl p-5 mb-4">
          <h3 className="text-sm font-semibold text-white mb-4">{editing ? "Edit Device" : "New Device"}</h3>
          <DeviceForm
            initial={editing}
            vaultCreds={vaultCreds}
            onSave={editing ? handleUpdate : handleCreate}
            onCancel={() => { setShowForm(false); setEditing(null); }}
          />
        </div>
      )}

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr>
                {[["hostname","Hostname"],["ip_address","IP"],["device_type","Type"],["vendor","Vendor"],["location","Location"],["status","Status"]].map(([k,l]) => (
                  <th key={k} onClick={() => sort(k)}
                    className="px-4 py-3 text-left text-xs font-medium text-muted cursor-pointer hover:text-white select-none">
                    <span className="flex items-center gap-1">{l}<SortIcon k={k} /></span>
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-xs font-medium text-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">Loading...</td></tr>
              ) : sorted.map((d) => (
                <tr key={d.id} className="hover:bg-white/2 transition-colors">
                  <td className="px-4 py-3 font-mono text-white">{d.hostname}</td>
                  <td className="px-4 py-3 font-mono text-muted">{d.ip_address}:{d.ssh_port}</td>
                  <td className="px-4 py-3 text-muted">{d.device_type}</td>
                  <td className="px-4 py-3 text-muted">{d.vendor}</td>
                  <td className="px-4 py-3 text-muted">{d.location || "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleTestSSH(d.id)} title="Test SSH"
                        className="p-1.5 text-muted hover:text-green-400 hover:bg-green-400/10 rounded transition-colors">
                        <Wifi size={13} />
                      </button>
                      <button onClick={() => handlePullConfig(d.id)} title="Pull Config"
                        className="p-1.5 text-muted hover:text-accent hover:bg-accent/10 rounded transition-colors">
                        <Download size={13} />
                      </button>
                      <button onClick={() => setEditing(d)} title="Edit"
                        className="p-1.5 text-muted hover:text-white hover:bg-white/10 rounded transition-colors">
                        <Edit3 size={13} />
                      </button>
                      <button onClick={() => handleAutoDetect(d.id)} title="Auto-detect OS/Serial"
                        className="p-1.5 text-muted hover:text-purple-400 hover:bg-purple-400/10 rounded transition-colors">
                        <Cpu size={13} />
                      </button>
                      <button onClick={() => handleDelete(d.id, d.hostname)} title="Delete"
                        className="p-1.5 text-muted hover:text-red-400 hover:bg-red-400/10 rounded transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
