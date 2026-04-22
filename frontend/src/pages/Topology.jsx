import { useEffect, useState, useCallback, useRef } from "react";
import ReactFlow, {
  Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge,
  EdgeLabelRenderer, getBezierPath, Handle, Position,
  Panel,
} from "reactflow";
import "reactflow/dist/style.css";
import Layout from "../components/Layout";
import { devicesAPI, topologyAPI } from "../api";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Plus, Trash2, Save, RotateCcw } from "lucide-react";

/* ─── SVG Device Icons ─── */
const RouterSVG = ({ color }) => (
  <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
    <circle cx="18" cy="18" r="10" stroke={color} strokeWidth="2.5"/>
    <line x1="18" y1="4" x2="18" y2="8" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <line x1="18" y1="28" x2="18" y2="32" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <line x1="4" y1="18" x2="8" y2="18" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <line x1="28" y1="18" x2="32" y2="18" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <path d="M13 15 L18 18 L13 21" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <path d="M23 15 L18 18 L23 21" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  </svg>
);

const SwitchSVG = ({ color }) => (
  <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
    <rect x="2" y="11" width="32" height="14" rx="3" stroke={color} strokeWidth="2.5"/>
    {[7, 12, 18, 24, 29].map((x) => (
      <circle key={x} cx={x} cy="18" r="2" fill={color}/>
    ))}
    <line x1="9" y1="11" x2="9" y2="5" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <line x1="27" y1="11" x2="27" y2="5" stroke={color} strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const FirewallSVG = ({ color }) => (
  <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
    <path d="M18 2 L32 7 L32 22 Q32 30 18 34 Q4 30 4 22 L4 7 Z" stroke={color} strokeWidth="2.5"/>
    {[11, 17, 23].map((y) => (
      <line key={y} x1="11" y1={y} x2="25" y2={y} stroke={color} strokeWidth="1.5" opacity="0.65"/>
    ))}
    <line x1="18" y1="7" x2="18" y2="29" stroke={color} strokeWidth="1.5" opacity="0.65"/>
  </svg>
);

const APSVG = ({ color }) => (
  <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
    <circle cx="18" cy="26" r="4" fill={color}/>
    <path d="M9 20 Q18 10 27 20" stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none"/>
    <path d="M3 14 Q18 2 33 14" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.6"/>
    <line x1="18" y1="26" x2="18" y2="34" stroke={color} strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const ServerSVG = ({ color }) => (
  <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
    <rect x="3" y="4"  width="30" height="8" rx="2" stroke={color} strokeWidth="2.5"/>
    <rect x="3" y="14" width="30" height="8" rx="2" stroke={color} strokeWidth="2.5"/>
    <rect x="3" y="24" width="30" height="8" rx="2" stroke={color} strokeWidth="2.5"/>
    <circle cx="28" cy="8"  r="1.5" fill={color}/>
    <circle cx="28" cy="18" r="1.5" fill={color}/>
    <circle cx="28" cy="28" r="1.5" fill={color}/>
  </svg>
);

const CloudSVG = ({ color }) => (
  <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
    <path d="M9 28 Q3 28 3 20 Q3 14 9 13 Q9 6 17 6 Q23 6 25 11 Q30 10 32 16 Q36 16 36 22 Q36 28 30 28 Z" stroke={color} strokeWidth="2.5"/>
  </svg>
);

const OtherSVG = ({ color }) => (
  <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
    <rect x="4" y="4" width="28" height="28" rx="4" stroke={color} strokeWidth="2.5"/>
    <line x1="12" y1="13" x2="24" y2="13" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <line x1="12" y1="18" x2="24" y2="18" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <line x1="12" y1="23" x2="20" y2="23" stroke={color} strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const DEVICE_ICONS = { router: RouterSVG, switch: SwitchSVG, firewall: FirewallSVG, ap: APSVG, server: ServerSVG, cloud: CloudSVG, other: OtherSVG };
const DEVICE_COLORS = { router: "#4f7cff", switch: "#22c55e", firewall: "#ef4444", ap: "#f59e0b", server: "#8b5cf6", cloud: "#6b7280", other: "#6b7280" };
const STATUS_COLORS = { online: "#22c55e", offline: "#ef4444", warning: "#f59e0b", unknown: "#6b7280" };

/* ─── Custom Device Node ─── */
function DeviceNode({ data, selected }) {
  const Icon = DEVICE_ICONS[data.device_type] || OtherSVG;
  const typeColor = DEVICE_COLORS[data.device_type] || "#6b7280";
  const statusColor = STATUS_COLORS[data.status] || STATUS_COLORS.unknown;

  return (
    <div
      onClick={data.onSelect}
      style={{
        border: `2px solid ${selected ? typeColor : statusColor + "80"}`,
        boxShadow: selected ? `0 0 16px ${typeColor}66` : `0 0 8px ${statusColor}33`,
      }}
      className="bg-[#13151f] rounded-xl px-3 py-2.5 min-w-[120px] cursor-pointer select-none transition-all"
    >
      {/* Handles on all 4 sides */}
      <Handle type="source" position={Position.Top}    id="top"    style={{ background: typeColor, width: 8, height: 8, border: "2px solid #13151f" }} />
      <Handle type="source" position={Position.Right}  id="right"  style={{ background: typeColor, width: 8, height: 8, border: "2px solid #13151f" }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ background: typeColor, width: 8, height: 8, border: "2px solid #13151f" }} />
      <Handle type="source" position={Position.Left}   id="left"   style={{ background: typeColor, width: 8, height: 8, border: "2px solid #13151f" }} />
      <Handle type="target" position={Position.Top}    id="top-t"    style={{ opacity: 0, width: 8, height: 8 }} />
      <Handle type="target" position={Position.Right}  id="right-t"  style={{ opacity: 0, width: 8, height: 8 }} />
      <Handle type="target" position={Position.Bottom} id="bottom-t" style={{ opacity: 0, width: 8, height: 8 }} />
      <Handle type="target" position={Position.Left}   id="left-t"   style={{ opacity: 0, width: 8, height: 8 }} />

      <div className="flex flex-col items-center gap-1">
        <Icon color={typeColor} />
        <div className="text-[11px] font-mono text-white font-semibold truncate max-w-[110px] text-center">{data.hostname}</div>
        <div className="text-[10px] font-mono text-muted">{data.ip_address}</div>
        <div className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: statusColor + "22", color: statusColor }}>
          {data.status}
        </div>
      </div>
    </div>
  );
}

/* ─── Custom Edge with port labels ─── */
function PortLabelEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, style, selected }) {
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <>
      <path id={id} style={{ ...style, strokeWidth: selected ? 2.5 : 1.5 }} className="react-flow__edge-path" d={path} markerEnd={markerEnd} />
      {(data?.source_port || data?.target_port) && (
        <EdgeLabelRenderer>
          <div style={{ position: "absolute", transform: `translate(-50%,-50%) translate(${lx}px,${ly}px)`, pointerEvents: "all" }}
            className="text-[9px] font-mono bg-[#13151f] border border-border rounded px-1 py-0.5 text-muted whitespace-nowrap">
            {[data.source_port, data.target_port].filter(Boolean).join(" ↔ ")}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { device: DeviceNode };
const edgeTypes = { portLabel: PortLabelEdge };

const POSITIONS_KEY = "nms_topology_positions";
const loadPositions = () => { try { return JSON.parse(localStorage.getItem(POSITIONS_KEY) || "{}"); } catch { return {}; } };
const savePositions = (map) => localStorage.setItem(POSITIONS_KEY, JSON.stringify(map));

function autoLayout(devices) {
  const typeOrder = ["firewall", "router", "switch", "ap", "server", "other"];
  const byType = {};
  devices.forEach((d) => { const t = d.device_type || "other"; (byType[t] = byType[t] || []).push(d); });
  const positions = {};
  let y = 0;
  for (const t of typeOrder) {
    const group = byType[t] || [];
    group.forEach((d, i) => { positions[d.id] = { x: i * 220, y }; });
    if (group.length) y += 180;
  }
  return positions;
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
  const posRef = useRef(loadPositions());

  const buildNodes = useCallback((devList, positions) => {
    return devList.map((d) => ({
      id: String(d.id),
      type: "device",
      position: positions[d.id] || { x: 0, y: 0 },
      data: { ...d, onSelect: () => setSelected(d) },
    }));
  }, []);

  const buildEdges = useCallback((linkList, devList) => {
    return linkList.map((l) => ({
      id: `link-${l.id}`,
      source: String(l.source_device_id),
      target: String(l.target_device_id),
      type: "portLabel",
      animated: devList.find((d) => d.id === l.source_device_id)?.status === "online",
      data: { source_port: l.source_port, target_port: l.target_port, linkId: l.id },
      style: { stroke: "#4f7cff" },
    }));
  }, []);

  const load = useCallback(async () => {
    const [devRes, linkRes] = await Promise.all([devicesAPI.list(), topologyAPI.links()]);
    const devList = devRes.data;
    const linkList = linkRes.data;
    setDevices(devList);
    setLinks(linkList);
    const saved = posRef.current;
    // auto-layout devices that don't have saved positions yet
    const missing = devList.filter((d) => !saved[d.id]);
    if (missing.length) {
      const auto = autoLayout(missing);
      const maxY = Math.max(0, ...Object.values(saved).map((p) => p.y));
      Object.entries(auto).forEach(([id, pos]) => { saved[id] = { x: pos.x, y: pos.y + maxY }; });
      posRef.current = saved;
      savePositions(saved);
    }
    setNodes(buildNodes(devList, saved));
    setEdges(buildEdges(linkList, devList));
  }, [buildNodes, buildEdges]);

  useEffect(() => { load(); }, []);

  const onNodeDragStop = useCallback((_, node) => {
    posRef.current[node.id] = node.position;
    savePositions(posRef.current);
  }, []);

  const onConnect = useCallback(async (params) => {
    const data = {
      source_device_id: parseInt(params.source),
      target_device_id: parseInt(params.target),
      source_port: null, target_port: null, link_type: "ethernet",
    };
    try {
      await topologyAPI.createLink(data);
      toast.success("Link created");
      load();
    } catch {
      toast.error("Failed to create link");
    }
  }, [load]);

  const deleteLink = async (linkId) => {
    await topologyAPI.deleteLink(linkId);
    toast.success("Link removed");
    load();
  };

  const onEdgeClick = useCallback((_, edge) => {
    if (edge.data?.linkId) setSelected({ _isEdge: true, linkId: edge.data.linkId, label: `Link #${edge.data.linkId}` });
  }, []);

  const createLink = async (e) => {
    e.preventDefault();
    await topologyAPI.createLink({
      source_device_id: parseInt(linkForm.source_device_id),
      target_device_id: parseInt(linkForm.target_device_id),
      source_port: linkForm.source_port || null,
      target_port: linkForm.target_port || null,
      link_type: linkForm.link_type,
    });
    toast.success("Link created");
    setShowLinkForm(false);
    load();
  };

  const resetLayout = () => {
    const auto = autoLayout(devices);
    posRef.current = auto;
    savePositions(auto);
    setNodes(buildNodes(devices, auto));
    toast.success("Layout reset");
  };

  return (
    <Layout title="Topology">
      {/* Toolbar */}
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <button onClick={() => setShowLinkForm(!showLinkForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent/10 hover:bg-accent/20 text-accent rounded-lg transition-colors">
          <Plus size={12} /> Add Link
        </button>
        <button onClick={resetLayout}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted border border-border hover:text-white rounded-lg transition-colors">
          <RotateCcw size={12} /> Reset Layout
        </button>
        <span className="text-xs text-muted self-center ml-1">
          {devices.length} devices · {links.length} links · drag handles to connect
        </span>
      </div>

      {showLinkForm && (
        <form onSubmit={createLink} className="bg-surface border border-border rounded-xl p-4 mb-3 grid grid-cols-3 gap-3">
          {[["source_device_id","Source"],["target_device_id","Target"]].map(([k,l]) => (
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
            <button type="submit" className="px-3 py-1.5 text-xs bg-accent text-white rounded-lg">Create</button>
          </div>
        </form>
      )}

      {/* Legend */}
      <div className="flex gap-3 mb-3 flex-wrap">
        {Object.entries(DEVICE_COLORS).map(([type, color]) => {
          const Icon = DEVICE_ICONS[type];
          return (
            <div key={type} className="flex items-center gap-1.5">
              <Icon color={color} />
              <span className="text-[10px] text-muted capitalize">{type}</span>
            </div>
          );
        })}
      </div>

      <div className="relative h-[calc(100vh-16rem)] bg-[#0e1018] border border-border rounded-xl overflow-hidden">
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          onEdgeClick={onEdgeClick}
          nodeTypes={nodeTypes} edgeTypes={edgeTypes}
          connectionMode="loose"
          fitView
          deleteKeyCode="Delete"
        >
          <Background color="#1a1d2e" gap={24} size={1} />
          <Controls className="!bg-surface !border-border" />
          <MiniMap
            nodeColor={(n) => STATUS_COLORS[n.data?.status] || STATUS_COLORS.unknown}
            className="!bg-surface !border-border"
            maskColor="#0e1018cc"
          />
        </ReactFlow>

        {selected && !selected._isEdge && (
          <div className="absolute top-4 right-4 bg-surface border border-border rounded-xl p-4 w-64 shadow-2xl z-10">
            <div className="flex items-center gap-2 mb-3">
              {(() => { const Icon = DEVICE_ICONS[selected.device_type] || OtherSVG; const c = DEVICE_COLORS[selected.device_type] || "#6b7280"; return <Icon color={c} />; })()}
              <div className="flex-1 min-w-0">
                <div className="font-mono font-semibold text-white text-sm truncate">{selected.hostname}</div>
                <div className="text-xs text-muted font-mono">{selected.ip_address}</div>
              </div>
              <button onClick={() => setSelected(null)} className="text-muted hover:text-white ml-1">✕</button>
            </div>
            <div className="space-y-1 text-xs mb-3">
              {[["Type",selected.device_type],["Vendor",selected.vendor],["OS",selected.os_version||"—"],["Location",selected.location||"—"],["Status",selected.status]].map(([k,v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-muted">{k}</span>
                  <span className="text-white font-mono">{v}</span>
                </div>
              ))}
            </div>
            <button onClick={() => navigate("/ssh")}
              className="w-full py-1.5 bg-accent hover:bg-accent/90 text-white text-xs rounded-lg transition-colors mb-2">
              Open SSH Console
            </button>
            {links.filter((l) => l.source_device_id === selected.id || l.target_device_id === selected.id).map((l) => {
              const other = devices.find((d) => d.id === (l.source_device_id === selected.id ? l.target_device_id : l.source_device_id));
              return (
                <div key={l.id} className="flex items-center justify-between text-xs text-muted bg-white/5 rounded px-2 py-1 mb-1">
                  <span className="truncate">{other?.hostname || `Device ${l.source_device_id}`}{l.source_port ? ` (${l.source_port})` : ""}</span>
                  <button onClick={() => deleteLink(l.id)} className="hover:text-red-400 transition-colors ml-1 shrink-0"><Trash2 size={11}/></button>
                </div>
              );
            })}
          </div>
        )}

        {selected?._isEdge && (
          <div className="absolute top-4 right-4 bg-surface border border-border rounded-xl p-4 w-56 shadow-2xl z-10">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm text-white font-medium">{selected.label}</span>
              <button onClick={() => setSelected(null)} className="text-muted hover:text-white">✕</button>
            </div>
            <button onClick={() => { deleteLink(selected.linkId); setSelected(null); }}
              className="w-full py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5">
              <Trash2 size={11}/> Delete Link
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
