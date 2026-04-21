import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { inventoryAPI } from "../api";
import { Plus, Trash2, Edit3, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { format, isPast } from "date-fns";

function ItemForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || {
    name: "", model: "", vendor: "", serial_number: "", quantity: 1,
    device_type: "", location: "", purchase_date: "", eol_date: "",
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}
      className="grid grid-cols-2 gap-3 bg-surface border border-border rounded-xl p-4 mb-4">
      {[["name","Name",true],["model","Model"],["vendor","Vendor"],["serial_number","Serial #"],["location","Location"],["device_type","Type"]].map(([k,l,req]) => (
        <div key={k}>
          <label className="block text-xs text-muted mb-1">{l}</label>
          <input required={!!req} value={form[k]} onChange={(e) => set(k, e.target.value)}
            className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent" />
        </div>
      ))}
      <div>
        <label className="block text-xs text-muted mb-1">Quantity</label>
        <input type="number" min="1" value={form.quantity} onChange={(e) => set("quantity", e.target.value)}
          className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent" />
      </div>
      <div>
        <label className="block text-xs text-muted mb-1">Purchase Date</label>
        <input type="date" value={form.purchase_date?.split("T")[0] || ""} onChange={(e) => set("purchase_date", e.target.value)}
          className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent" />
      </div>
      <div>
        <label className="block text-xs text-muted mb-1">EOL Date</label>
        <input type="date" value={form.eol_date?.split("T")[0] || ""} onChange={(e) => set("eol_date", e.target.value)}
          className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent" />
      </div>
      <div className="col-span-2 flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-1.5 text-sm text-muted border border-border rounded-lg">Cancel</button>
        <button type="submit" className="px-4 py-1.5 text-sm bg-accent text-white rounded-lg">Save</button>
      </div>
    </form>
  );
}

export default function Inventory() {
  const [tab, setTab] = useState("hardware");
  const [items, setItems] = useState([]);
  const [licenses, setLicenses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = () => {
    inventoryAPI.list().then((r) => setItems(r.data));
    inventoryAPI.licenses().then((r) => setLicenses(r.data));
  };
  useEffect(() => { load(); }, []);

  const save = async (data) => {
    if (editing) { await inventoryAPI.update(editing.id, data); toast.success("Updated"); }
    else { await inventoryAPI.create(data); toast.success("Added"); }
    setShowForm(false); setEditing(null); load();
  };

  const del = async (id) => {
    if (!confirm("Delete?")) return;
    await inventoryAPI.delete(id);
    toast.success("Deleted"); load();
  };

  return (
    <Layout title="Inventory">
      <div className="flex gap-2 mb-4">
        {["hardware", "licenses"].map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${tab === t ? "bg-accent text-white" : "text-muted border border-border hover:text-white"}`}>
            {t === "hardware" ? "Hardware" : "Licenses"}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={() => { setShowForm(true); setEditing(null); }}
          className="flex items-center gap-2 px-4 py-1.5 bg-accent text-white text-sm rounded-lg">
          <Plus size={14} /> Add
        </button>
      </div>

      {(showForm || editing) && (
        <ItemForm initial={editing} onSave={save} onCancel={() => { setShowForm(false); setEditing(null); }} />
      )}

      {tab === "hardware" && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr>
                  {["Name","Model","Vendor","Serial","Qty","Type","Location","EOL"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted">{h}</th>
                  ))}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((i) => {
                  const eolPast = i.eol_date && isPast(new Date(i.eol_date));
                  return (
                    <tr key={i.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 text-white font-medium">{i.name}</td>
                      <td className="px-4 py-2.5 text-muted">{i.model || "—"}</td>
                      <td className="px-4 py-2.5 text-muted">{i.vendor || "—"}</td>
                      <td className="px-4 py-2.5 font-mono text-muted text-xs">{i.serial_number || "—"}</td>
                      <td className="px-4 py-2.5 text-muted">{i.quantity}</td>
                      <td className="px-4 py-2.5 text-muted">{i.device_type || "—"}</td>
                      <td className="px-4 py-2.5 text-muted">{i.location || "—"}</td>
                      <td className="px-4 py-2.5">
                        {i.eol_date ? (
                          <span className={`text-xs font-mono flex items-center gap-1 ${eolPast ? "text-red-400" : "text-muted"}`}>
                            {eolPast && <AlertTriangle size={11} />}
                            {format(new Date(i.eol_date), "yyyy-MM-dd")}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1">
                          <button onClick={() => setEditing(i)} className="p-1.5 text-muted hover:text-white rounded transition-colors"><Edit3 size={12} /></button>
                          <button onClick={() => del(i.id)} className="p-1.5 text-muted hover:text-red-400 rounded transition-colors"><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "licenses" && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr>
                  {["Name","Type","Vendor","Expires","Notes"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {licenses.map((l) => {
                  const expired = isPast(new Date(l.expiry_date));
                  return (
                    <tr key={l.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 text-white">{l.name}</td>
                      <td className="px-4 py-2.5 text-muted">{l.license_type}</td>
                      <td className="px-4 py-2.5 text-muted">{l.vendor}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-mono flex items-center gap-1 ${expired ? "text-red-400" : "text-muted"}`}>
                          {expired && <AlertTriangle size={11} />}
                          {format(new Date(l.expiry_date), "yyyy-MM-dd")}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted text-xs">{l.notes || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  );
}
