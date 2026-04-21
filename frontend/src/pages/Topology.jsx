import { useEffect, useState, useCallback } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  EdgeLabelRenderer,
  getBezierPath,
} from "reactflow";
import "reactflow/dist/style.css";
import Layout from "../components/Layout";
import { devicesAPI, topologyAPI } from "../api";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Plus, Trash2 } from "lucide-react";

const statusColors = {
  online: "#22c55e",
  offline: "#ef4444",
  warning: "#f59e0b",
  unknown: "#6b7280",
};

const typeIcons = {
  router: "🔷",
  switch: "🔀",
  firewall: "🔥",
  ap: "📡",
  server: "🖥️",
  other: "📦",
};

function DeviceNode({ data }) {
  const color = statusColors[data.status] || statusColors.unknown;
  return (
    <div
      style={{ border: `2px solid ${color}`, boxShadow: `0 0 12px ${color}44` }}
      className="bg-surface rounded-xl px-4 py-3 min-w-[140px] cursor-pointer"
      onClick={data.onOpen}
    >
      <div className="text-center">
        <div className="text-xl mb-1">{typeIcons[data.device_type] || "📦"}</div>
        <div className="text-xs font-mono text-white font-semibold truncate">{data.hostname}</div>
        <div className="text-xs font-mono text-muted">{data.ip_address}</div>
        <div className="mt-1.5 text-xs px-2 py-0.5 rounded-full inline-block" style={{ background: `${color}22`, color }}>
          {data.status}
        </div>
      </div>
    </div>
  );
}

function PortLabelEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, style }) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <>
      <path id={id} style={style} className="react-flow__edge-path" d={edgePath} markerEnd={markerEnd} />
      {(data?.source_port || data?.target_port) && (
        <EdgeLabelRenderer>
          <div style={{ position: "absolute", transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`, pointerEvents: "all" }}
            className="text-[9px] font-mono bg-surface border border-border rounded px-1 py-0.5 text-muted whitespace-nowrap">
            {[data.source_port, data.target_port].filter(Boolean).join(" ↔ ")}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { device: DeviceNode };
const edgeTypes = { portLabel: PortLabelEdge };

function positionNodes(devices) {
  const byType = {};
  devices.forEach((d) => {
    const t = d.device_type || "other";
    if (!byType[t]) byType[t] = [];
    byType[t].push(d);
  });
  const typeOrder = ["firewall", "router", "switch", "ap", "server", "other"];
  const nodes = [];
  let y = 0;
  for (const t of typeOrder) {
    const group = byType[t] || [];
    group.forEach((d, i) => {
      nodes.push({ id: String(d.id), type: "device", position: { x: i * 200, y }, data: { ...d } });
    });
    if (group.length > 0) y += 160;
  }
  return nodes;
}

export default function Topology() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selected, setSelected] = useState(null);
  const [devices, setDevices] = useState([]);
  const [links, setLinks] = useState([]);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkForm, setLinkForm] = useState({ source_device_id: "", target_device_id: "", source_port: "", target_port: "", link_type: "ethernet" });
  const navigate = useNavigate();

  const load = useCallback(async () => {
    const [devRes, linkRes] = await Promise.all([devicesAPI.list(), topologyAPI.links()]);
    const devList = devRes.data;
    const linkList = linkRes.data;
    setDevices(devList);
    setLinks(linkList);

    const ns = positionNodes(devList).map((n) => ({
      ...n,
      data: { ...n.data, onOpen: () => setSelected(devList.find((d) => d.id === parseInt(n.id))) },
    }));
    setNodes(ns);

    const es = linkList.map((l) => ({
      id: `link-${l.id}`,
      source: String(l.source_device_id),
      target: String(l.target_device_id),
      type: "portLabel",
      animated: devList.find((d) => d.id === l.source_device_id)?.status === "online",
      data: { source_port: l.source_port, target_port: l.target_port },
      style: { stroke: "#4f7cff", strokeWidth: 1.5 },
    }));

    // Add auto edges if no real links exist
    if (linkList.length === 0) {
      const routers = devList.filter((d) => d.device_type === "router");
      const switches = devList.filter((d) => d.device_type === "switch");
      const endpoints = devList.filter((d) => ["server", "ap"].includes(d.device_type));
      routers.forEach((r) => switches.slice(0, 2).forEach((s) => {
        es.push({ id: `auto-r${r.id}-s${s.id}`, source: String(r.id), target: String(s.id), animated: r.status === "online", style: { stroke: "#4f7cff", strokeWidth: 1.5 } });
      }));
      switches.forEach((s) => endpoints.slice(0, 3).forEach((e) => {
        es.push({ id: `auto-s${s.id}-e${e.id}`, source: String(s.id), target: String(e.id), style: { stroke: "#6b7280", strokeWidth: 1 } });
      }));
    }

    setEdges(es);
  }, []);

  useEffect(() => { load(); }, []);

  const createLink = async (e) => {
    e.preventDefault();
    const data = {
      source_device_id: parseInt(linkForm.source_device_id),
      target_device_id: parseInt(linkForm.target_device_id),
      source_port: linkForm.source_port || null,
      target_port: linkForm.target_port || null,
      link_type: linkForm.link_type,
    };
    await topologyAPI.createLink(data);
    toast.success("Link created");
    setShowLinkForm(false);
    load();
  };

  const deleteLink = async (id) => {
    await topologyAPI.deleteLink(id);
    toast.success("Link removed");
    load();
  };

  return (
    <Layout title="Topology">
      <div className="flex gap-3 mb-3">
        <button onClick={() => setShowLinkForm(!showLinkForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent/10 hover:bg-accent/20 text-accent rounded-lg transition-colors">
          <Plus size={12} /> Add Link
        </button>
        {links.length > 0 && (
          <span className="text-xs text-muted self-center">{links.length} defined link{links.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      {showLinkForm && (
        <form onSubmit={createLink} className="bg-surface border border-border rounded-xl p-4 mb-3 grid grid-cols-3 gap-3">
          {[["source_device_id","Source Device"],["target_device_id","Target Device"]].map(([k,l]) => (
            <div key={k}>
              <label className="block text-xs text-muted mb-1">{l}</label>
              <select value={linkForm[k]} onChange={(e) => setLinkForm((f) => ({ ...f, [k]: e.target.value }))} required
                className="w-full bg-bg border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent">
                <option value="">Select…</option>
                {devices.map((d) => <option key={d.id} value={d.id}>{d.hostname}</option>)}
              </select>
            </div>
          ))}
          <div>
            <label className="block text-xs text-muted mb-1">Link Type</label>
            <select value={linkForm.link_type} onChange={(e) => setLinkForm((f) => ({ ...f, link_type: e.target.value }))}
              className="w-full bg-bg border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent">
              {["ethernet","fiber","wireless","vpn","other"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          {[["source_port","Source Port"],["target_port","Target Port"]].map(([k,l]) => (
            <div key={k}>
              <label className="block text-xs text-muted mb-1">{l} (optional)</label>
              <input value={linkForm[k]} onChange={(e) => setLinkForm((f) => ({ ...f, [k]: e.target.value }))} placeholder="e.g. Gi0/0"
                className="w-full bg-bg border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent" />
            </div>
          ))}
          <div className="col-span-3 flex gap-2 justify-end">
            <button type="button" onClick={() => setShowLinkForm(false)} className="px-3 py-1.5 text-xs text-muted border border-border rounded-lg">Cancel</button>
            <button type="submit" className="px-3 py-1.5 text-xs bg-accent text-white rounded-lg">Create Link</button>
          </div>
        </form>
      )}

      <div className="relative h-[calc(100vh-12rem)] bg-surface border border-border rounded-xl overflow-hidden">
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes} edgeTypes={edgeTypes}
          fitView
        >
          <Background color="#2a2d3e" gap={20} />
          <Controls className="bg-surface border border-border" />
          <MiniMap nodeColor={(n) => statusColors[n.data?.status] || statusColors.unknown} className="bg-surface border border-border" />
        </ReactFlow>

        {selected && (
          <div className="absolute top-4 right-4 bg-surface border border-border rounded-xl p-4 w-64 shadow-xl z-10">
            <div className="flex justify-between items-start mb-3">
              <div className="font-mono font-semibold text-white">{selected.hostname}</div>
              <button onClick={() => setSelected(null)} className="text-muted hover:text-white">✕</button>
            </div>
            <div className="space-y-1.5 text-xs">
              {[["IP",selected.ip_address],["Type",selected.device_type],["Vendor",selected.vendor],["OS",selected.os_version||"—"],["Location",selected.location||"—"],["Status",selected.status]].map(([k,v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-muted">{k}</span>
                  <span className="text-white font-mono">{v}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-1.5">
              <button onClick={() => navigate("/ssh")}
                className="w-full py-1.5 bg-accent hover:bg-accent/90 text-white text-xs rounded-lg transition-colors">
                Open SSH Console
              </button>
              {links.filter((l) => l.source_device_id === selected.id || l.target_device_id === selected.id).map((l) => (
                <div key={l.id} className="flex items-center justify-between text-xs text-muted bg-white/5 rounded px-2 py-1">
                  <span>{[l.source_port, l.target_port].filter(Boolean).join("↔") || `Link #${l.id}`}</span>
                  <button onClick={() => deleteLink(l.id)} className="hover:text-red-400 transition-colors"><Trash2 size={11}/></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
