import { useState } from "react";
import Layout from "../components/Layout";
import StatusBadge from "../components/StatusBadge";
import { devicesAPI, vaultAPI } from "../api";
import { Plus, Trash2, Edit3, Wifi, Download, ChevronDown, ChevronUp, Cpu, Radar, X, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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

function DiscoveryPanel({ vaultCreds, onAdded, onClose }) {
  const [subnet, setSubnet] = useState("");
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState(null);
  const [addingIp, setAddingIp] = useState(null);

  const handleScan = async () => {
    if (!subnet.trim()) return;
    setScanning(true);
    setResults(null);
    setAddingIp(null);
    try {
      const res = await devicesAPI.discover(subnet.trim());
      setResults(res.data);
      if (res.data.discovered.length === 0) toast("No reachable hosts found", { icon: "🔍" });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const handleAdd = async (data) => {
    try {
      await devicesAPI.create(data);
      toast.success(`${data.hostname} added`);
      setAddingIp(null);
      onAdded();
      // mark as existing in results
      setResults((prev) => ({
        ...prev,
        discovered: prev.discovered.map((h) =>
          h.ip === data.ip_address ? { ...h, already_exists: true, hostname: data.hostname } : h
        ),
      }));
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add device");
    }
  };

  const newHosts = results ? results.discovered.filter((h) => !h.already_exists) : [];
  const existingHosts = results ? results.discovered.filter((h) => h.already_exists) : [];

  return (
    <div className="bg-surface border border-border rounded-xl p-5 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Radar size={15} className="text-accent" /> Auto Discovery
        </h3>
        <button onClick={onClose} className="text-muted hover:text-white transition-colors">
          <X size={15} />
        </button>
      </div>

      {/* Subnet input */}
      <div className="flex gap-2 mb-4">
        <input
          placeholder="e.g. 192.168.1.0/24"
          value={subnet}
          onChange={(e) => setSubnet(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleScan()}
          className="flex-1 bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
        />
        <button
          onClick={handleScan}
          disabled={scanning || !subnet.trim()}
          className="px-4 py-1.5 text-sm bg-accent hover:bg-accent/90 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center gap-2"
        >
          {scanning ? (
            <><span className="animate-spin inline-block w-3 h-3 border border-white border-t-transparent rounded-full" /> Scanning...</>
          ) : (
            <><Radar size={13} /> Scan</>
          )}
        </button>
      </div>

      {/* Results */}
      {results && (
        <div>
          <p className="text-xs text-muted mb-3">
            Subnet <span className="text-white font-mono">{results.subnet}</span> —{" "}
            <span className="text-green-400">{newHosts.length} new</span>
            {existingHosts.length > 0 && <span className="text-muted">, {existingHosts.length} already in DB</span>}
          </p>

          {results.discovered.length === 0 ? (
            <p className="text-xs text-muted text-center py-4">No reachable hosts found</p>
          ) : (
            <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
              {results.discovered.map((host) => (
                <div key={host.ip}>
                  {addingIp === host.ip ? (
                    <div className="bg-bg border border-border rounded-lg p-4 mb-2">
                      <p className="text-xs text-muted mb-3">Adding <span className="font-mono text-white">{host.ip}</span></p>
                      <DeviceForm
                        initial={{ hostname: "", ip_address: host.ip, ssh_port: 22, device_type: "router", vendor: "cisco", os_version: "", location: "", snmp_community: "", snmp_version: "v2c", vault_credential_id: "" }}
                        vaultCreds={vaultCreds}
                        onSave={handleAdd}
                        onCancel={() => setAddingIp(null)}
                      />
                    </div>
                  ) : (
                    <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${host.already_exists ? "opacity-50" : "hover:bg-white/5"} transition-colors`}>
                      <div className="flex items-center gap-3">
                        {host.already_exists ? (
                          <CheckCircle2 size={13} className="text-green-500 shrink-0" />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                        )}
                        <span className="font-mono text-sm text-white">{host.ip}</span>
                        {host.rtt_ms != null && (
                          <span className="text-xs text-muted">{host.rtt_ms.toFixed(1)} ms</span>
                        )}
                        {host.hostname && (
                          <span className="text-xs text-accent">{host.hostname}</span>
                        )}
                      </div>
                      {!host.already_exists && (
                        <button
                          onClick={() => setAddingIp(host.ip)}
                          className="text-xs px-2.5 py-1 bg-accent/20 hover:bg-accent/40 text-accent rounded transition-colors"
                        >
                          + Add
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DeviceHub() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showDiscover, setShowDiscover] = useState(false);
  const [sortKey, setSortKey] = useState("hostname");
  const [sortDir, setSortDir] = useState(1);
  const [filter, setFilter] = useState("");

  const { data: devices = [], isLoading: loading } = useQuery({ queryKey: ["devices"], queryFn: () => devicesAPI.list().then(r => r.data), staleTime: 30_000 });
  const { data: vaultCreds = [] } = useQuery({ queryKey: ["vault"], queryFn: () => vaultAPI.list().then(r => r.data), staleTime: 60_000 });

  const load = () => qc.invalidateQueries({ queryKey: ["devices"] });

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
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowDiscover((v) => !v); setShowForm(false); setEditing(null); }}
            className="flex items-center gap-2 px-4 py-1.5 bg-surface hover:bg-white/10 border border-border text-white text-sm rounded-lg transition-colors"
          >
            <Radar size={14} /> Auto Discover
          </button>
          <button onClick={() => { setShowForm(true); setEditing(null); setShowDiscover(false); }}
            className="flex items-center gap-2 px-4 py-1.5 bg-accent hover:bg-accent/90 text-white text-sm rounded-lg transition-colors">
            <Plus size={14} /> Add Device
          </button>
        </div>
      </div>

      {showDiscover && (
        <DiscoveryPanel
          vaultCreds={vaultCreds}
          onAdded={load}
          onClose={() => setShowDiscover(false)}
        />
      )}

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
