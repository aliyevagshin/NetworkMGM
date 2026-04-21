import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import StatusBadge from "../components/StatusBadge";
import { ipamAPI } from "../api";
import { Plus, Trash2, Search, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";

export default function IPAM() {
  const [subnets, setSubnets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [showSubnetForm, setShowSubnetForm] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [subnetForm, setSubnetForm] = useState({ name: "", cidr: "", gateway: "", vlan_id: "", description: "" });

  const loadSubnets = () => ipamAPI.subnets().then((r) => setSubnets(r.data));

  useEffect(() => { loadSubnets(); }, []);

  const selectSubnet = (s) => {
    setSelected(s);
    ipamAPI.addresses(s.id).then((r) => setAddresses(r.data));
  };

  const createSubnet = async (e) => {
    e.preventDefault();
    const data = { ...subnetForm };
    if (data.vlan_id) data.vlan_id = parseInt(data.vlan_id);
    else delete data.vlan_id;
    await ipamAPI.createSubnet(data);
    toast.success("Subnet created");
    setShowSubnetForm(false);
    setSubnetForm({ name: "", cidr: "", gateway: "", vlan_id: "", description: "" });
    loadSubnets();
  };

  const deleteSubnet = async (id) => {
    if (!confirm("Delete subnet?")) return;
    await ipamAPI.deleteSubnet(id);
    toast.success("Deleted");
    setSelected(null);
    setAddresses([]);
    loadSubnets();
  };

  const scan = async () => {
    if (!selected) return;
    setScanning(true);
    toast.loading("Scanning...", { id: "scan" });
    const res = await ipamAPI.scan(selected.id);
    toast.success(`Scanned ${res.data.total_scanned} hosts, found ${res.data.discovered.length} active`, { id: "scan" });
    setScanning(false);
    selectSubnet(selected);
  };

  const free = addresses.filter((a) => a.status === "free").length;
  const allocated = addresses.filter((a) => a.status !== "free").length;

  return (
    <Layout title="IPAM">
      <div className="flex gap-4">
        <div className="w-72 shrink-0">
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="text-xs font-medium text-muted">Subnets</span>
              <button onClick={() => setShowSubnetForm(!showSubnetForm)}
                className="text-muted hover:text-white transition-colors">
                <Plus size={14} />
              </button>
            </div>
            {showSubnetForm && (
              <form onSubmit={createSubnet} className="p-3 border-b border-border space-y-2">
                {[["name","Name"],["cidr","CIDR (e.g. 192.168.1.0/24)"],["gateway","Gateway"],["vlan_id","VLAN ID"],["description","Description"]].map(([k,l]) => (
                  <input key={k} placeholder={l} value={subnetForm[k]}
                    onChange={(e) => setSubnetForm((f) => ({ ...f, [k]: e.target.value }))}
                    className="w-full bg-bg border border-border rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent" />
                ))}
                <button type="submit" className="w-full py-1.5 bg-accent text-white text-xs rounded transition-colors">Create</button>
              </form>
            )}
            <div className="divide-y divide-border max-h-96 overflow-y-auto">
              {subnets.map((s) => (
                <div key={s.id}
                  onClick={() => selectSubnet(s)}
                  className={`px-4 py-3 cursor-pointer flex items-center justify-between transition-colors ${selected?.id === s.id ? "bg-accent/10 text-accent" : "hover:bg-white/5 text-muted"}`}>
                  <div>
                    <div className="text-sm font-mono text-white">{s.cidr}</div>
                    <div className="text-xs">{s.name}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={(e) => { e.stopPropagation(); deleteSubnet(s.id); }}
                      className="p-1 hover:text-red-400 transition-colors">
                      <Trash2 size={12} />
                    </button>
                    <ChevronRight size={12} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          {selected ? (
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <div className="font-mono text-white font-semibold">{selected.cidr}</div>
                  <div className="text-xs text-muted mt-0.5">
                    GW: {selected.gateway || "—"} · VLAN: {selected.vlan_id || "—"} · {free} free · {allocated} allocated
                  </div>
                </div>
                <button onClick={scan} disabled={scanning}
                  className="flex items-center gap-2 px-3 py-1.5 bg-accent/10 hover:bg-accent/20 text-accent text-sm rounded-lg transition-colors disabled:opacity-50">
                  <Search size={13} />
                  {scanning ? "Scanning..." : "Scan"}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border">
                    <tr>
                      {["IP Address","Hostname","MAC","Status","Description"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {addresses.map((a) => (
                      <tr key={a.id} className="hover:bg-white/2">
                        <td className="px-4 py-2.5 font-mono text-white">{a.address}</td>
                        <td className="px-4 py-2.5 font-mono text-muted">{a.hostname || "—"}</td>
                        <td className="px-4 py-2.5 font-mono text-muted">{a.mac_address || "—"}</td>
                        <td className="px-4 py-2.5"><StatusBadge status={a.status} /></td>
                        <td className="px-4 py-2.5 text-muted">{a.description || "—"}</td>
                      </tr>
                    ))}
                    {addresses.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-muted text-sm">No IPs found — run a scan</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="h-64 bg-surface border border-border rounded-xl flex items-center justify-center text-muted text-sm">
              Select a subnet to view IP addresses
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
