import { useEffect, useState, useCallback, useRef } from "react";
import ReactFlow, {
  Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge,
  EdgeLabelRenderer, getBezierPath, Handle, Position,
} from "reactflow";
import "reactflow/dist/style.css";
import Layout from "../components/Layout";
import { devicesAPI, topologyAPI } from "../api";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Plus, Trash2, RotateCcw, FileDown } from "lucide-react";

/* ─── SVG Icons ─── */
const RouterSVG = ({ color }) => (
  <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
    <circle cx="19" cy="19" r="11" stroke={color} strokeWidth="2.5"/>
    <line x1="19" y1="3"  x2="19" y2="8"  stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <line x1="19" y1="30" x2="19" y2="35" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <line x1="3"  y1="19" x2="8"  y2="19" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <line x1="30" y1="19" x2="35" y2="19" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <path d="M14 16 L19 19 L14 22" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <path d="M24 16 L19 19 L24 22" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  </svg>
);
const SwitchSVG = ({ color }) => (
  <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
    <rect x="2" y="12" width="34" height="14" rx="3" stroke={color} strokeWidth="2.5"/>
    {[7,13,19,25,31].map(x => <circle key={x} cx={x} cy="19" r="2" fill={color}/>)}
    <line x1="9"  y1="12" x2="9"  y2="5" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <line x1="29" y1="12" x2="29" y2="5" stroke={color} strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
const FirewallSVG = ({ color }) => (
  <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
    <path d="M19 2 L34 8 L34 23 Q34 32 19 36 Q4 32 4 23 L4 8 Z" stroke={color} strokeWidth="2.5"/>
    {[12,18,24].map(y => <line key={y} x1="11" y1={y} x2="27" y2={y} stroke={color} strokeWidth="1.5" opacity="0.6"/>)}
    <line x1="19" y1="7" x2="19" y2="31" stroke={color} strokeWidth="1.5" opacity="0.6"/>
  </svg>
);
const APSVG = ({ color }) => (
  <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
    <circle cx="19" cy="27" r="4" fill={color}/>
    <path d="M10 21 Q19 11 28 21" stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none"/>
    <path d="M3 15 Q19 3 35 15" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.55"/>
    <line x1="19" y1="27" x2="19" y2="35" stroke={color} strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
const ServerSVG = ({ color }) => (
  <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
    <rect x="3" y="4"  width="32" height="8" rx="2" stroke={color} strokeWidth="2.5"/>
    <rect x="3" y="15" width="32" height="8" rx="2" stroke={color} strokeWidth="2.5"/>
    <rect x="3" y="26" width="32" height="8" rx="2" stroke={color} strokeWidth="2.5"/>
    <circle cx="30" cy="8"  r="1.5" fill={color}/>
    <circle cx="30" cy="19" r="1.5" fill={color}/>
    <circle cx="30" cy="30" r="1.5" fill={color}/>
  </svg>
);
const CloudSVG = ({ color }) => (
  <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
    <path d="M9 30 Q3 30 3 21 Q3 14 9 13 Q9 6 17 6 Q24 6 26 11 Q32 10 34 17 Q38 17 38 23 Q38 30 31 30 Z" stroke={color} strokeWidth="2.5"/>
  </svg>
);
const OtherSVG = ({ color }) => (
  <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
    <rect x="4" y="4" width="30" height="30" rx="4" stroke={color} strokeWidth="2.5"/>
    <line x1="12" y1="14" x2="26" y2="14" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <line x1="12" y1="19" x2="26" y2="19" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <line x1="12" y1="24" x2="21" y2="24" stroke={color} strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const ICONS  = { router: RouterSVG, switch: SwitchSVG, firewall: FirewallSVG, ap: APSVG, server: ServerSVG, cloud: CloudSVG, other: OtherSVG };
const TCOLOR = { router: "#4f7cff", switch: "#22c55e", firewall: "#ef4444", ap: "#f59e0b", server: "#8b5cf6", cloud: "#6b7280", other: "#6b7280" };
const SCOLOR = { online: "#22c55e", offline: "#ef4444", warning: "#f59e0b", unknown: "#6b7280" };

/* ─── Device Node ─── */
function DeviceNode({ data, selected }) {
  const Icon  = ICONS[data.device_type]  || OtherSVG;
  const tCol  = TCOLOR[data.device_type] || "#6b7280";
  const sCol  = SCOLOR[data.status]      || SCOLOR.unknown;
  const border = selected ? tCol : sCol + "99";
  const shadow = selected ? `0 0 18px ${tCol}77` : `0 0 8px ${sCol}44`;

  return (
    <div
      onClick={data.onSelect}
      style={{ border: `2px solid ${border}`, boxShadow: shadow }}
      className="bg-[#13151f] rounded-xl px-3 py-2.5 min-w-[130px] cursor-pointer select-none"
    >
      {/* 4 handles – source type + connectionMode loose = acts as both */}
      {[Position.Top, Position.Right, Position.Bottom, Position.Left].map((pos) => (
        <Handle
          key={pos} type="source" position={pos} id={pos}
          style={{ background: tCol, width: 10, height: 10, border: `2px solid #13151f`, borderRadius: "50%" }}
        />
      ))}
      <div className="flex flex-col items-center gap-1 pointer-events-none">
        <Icon color={tCol} />
        <div className="text-[11px] font-mono text-white font-semibold truncate max-w-[110px] text-center">{data.hostname}</div>
        <div className="text-[10px] font-mono text-muted">{data.ip_address}</div>
        <div className="text-[9px] px-1.5 py-0.5 rounded-full mt-0.5" style={{ background: sCol + "22", color: sCol }}>
          {data.status}
        </div>
      </div>
    </div>
  );
}

/* ─── Edge with port labels ─── */
function PortEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, style, selected }) {
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
const edgeTypes = { port: PortEdge };

const POS_KEY = "nms_topo_pos";
const loadPos = () => { try { return JSON.parse(localStorage.getItem(POS_KEY) || "{}"); } catch { return {}; } };
const savePos = (m) => localStorage.setItem(POS_KEY, JSON.stringify(m));

function autoLayout(devList) {
  const order = ["firewall","router","switch","ap","server","other"];
  const byType = {};
  devList.forEach(d => { const t = d.device_type||"other"; (byType[t]=byType[t]||[]).push(d); });
  const pos = {};
  let y = 0;
  for (const t of order) {
    const g = byType[t] || [];
    g.forEach((d, i) => { pos[d.id] = { x: i * 230, y }; });
    if (g.length) y += 190;
  }
  return pos;
}

export default function Topology() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [devices, setDevices] = useState([]);
  const [links, setLinks] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ source_device_id:"", target_device_id:"", source_port:"", target_port:"", link_type:"ethernet" });
  const posRef = useRef(loadPos());
  const navigate = useNavigate();

  const makeNodes = useCallback((devList, pos) =>
    devList.map(d => ({
      id: String(d.id), type: "device",
      position: pos[d.id] || { x: 0, y: 0 },
      data: { ...d, onSelect: () => setSelected(d) },
    })), []);

  const makeEdges = useCallback((linkList, devList) =>
    linkList.map(l => ({
      id: `e-${l.id}`,
      source: String(l.source_device_id),
      target: String(l.target_device_id),
      type: "port",
      animated: devList.find(d => d.id === l.source_device_id)?.status === "online",
      data: { source_port: l.source_port, target_port: l.target_port, linkId: l.id },
      style: { stroke: "#4f7cff" },
    })), []);

  const load = useCallback(async () => {
    const [dr, lr] = await Promise.all([devicesAPI.list(), topologyAPI.links()]);
    const devList = dr.data, linkList = lr.data;
    setDevices(devList); setLinks(linkList);
    const saved = { ...posRef.current };
    const missing = devList.filter(d => !saved[d.id]);
    if (missing.length) {
      const maxY = Object.values(saved).reduce((m, p) => Math.max(m, p.y), 0);
      const auto = autoLayout(missing);
      Object.entries(auto).forEach(([id, p]) => { saved[id] = { x: p.x, y: p.y + (maxY ? maxY + 190 : 0) }; });
      posRef.current = saved; savePos(saved);
    }
    setNodes(makeNodes(devList, saved));
    setEdges(makeEdges(linkList, devList));
  }, [makeNodes, makeEdges]);

  useEffect(() => { load(); }, []);

  const onNodeDragStop = useCallback((_, node) => {
    posRef.current[node.id] = node.position;
    savePos(posRef.current);
  }, []);

  const onConnect = useCallback(async (params) => {
    // Add edge immediately for instant visual feedback
    const tempEdge = {
      id: `temp-${params.source}-${params.target}`,
      source: params.source, target: params.target,
      type: "port", animated: true,
      style: { stroke: "#4f7cff", strokeDasharray: "5,3" },
      data: {},
    };
    setEdges(eds => addEdge(tempEdge, eds));
    try {
      await topologyAPI.createLink({
        source_device_id: parseInt(params.source),
        target_device_id: parseInt(params.target),
        source_port: null, target_port: null, link_type: "ethernet",
      });
      toast.success("Link created");
      load();
    } catch (e) {
      setEdges(eds => eds.filter(e => e.id !== tempEdge.id));
      toast.error("Failed to create link");
    }
  }, [load, setEdges]);

  const deleteLink = async (linkId) => {
    await topologyAPI.deleteLink(linkId);
    toast.success("Link removed");
    setSelected(null);
    load();
  };

  const onEdgeClick = useCallback((_, edge) => {
    if (edge.data?.linkId) setSelected({ _edge: true, linkId: edge.data.linkId });
  }, []);

  const resetLayout = () => {
    const pos = autoLayout(devices);
    posRef.current = pos; savePos(pos);
    setNodes(makeNodes(devices, pos));
    toast.success("Layout reset");
  };

  const exportPDF = () => {
    const el = document.getElementById("topology-print-root");
    if (el) el.style.display = "block";
    const style = document.createElement("style");
    style.id = "topo-print-style";
    style.textContent = `@media print { body > *:not(#topology-print-root) { display:none!important; } }`;
    document.head.appendChild(style);
    window.print();
    window.addEventListener("afterprint", () => {
      document.head.removeChild(style);
    }, { once: true });
  };

  const createLink = async (e) => {
    e.preventDefault();
    await topologyAPI.createLink({
      source_device_id: parseInt(form.source_device_id),
      target_device_id: parseInt(form.target_device_id),
      source_port: form.source_port || null,
      target_port: form.target_port || null,
      link_type: form.link_type,
    });
    toast.success("Link created"); setShowForm(false); load();
  };

  return (
    <Layout title="Topology">
      {/* Toolbar */}
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent/10 hover:bg-accent/20 text-accent rounded-lg transition-colors">
          <Plus size={12}/> Add Link
        </button>
        <button onClick={resetLayout}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted border border-border hover:text-white rounded-lg transition-colors">
          <RotateCcw size={12}/> Reset Layout
        </button>
        <button onClick={exportPDF}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted border border-border hover:text-accent rounded-lg transition-colors">
          <FileDown size={12}/> Export PDF
        </button>
        <span className="text-xs text-muted ml-1">{devices.length} devices · {links.length} links</span>
        <span className="text-xs text-muted/60 ml-auto">Drag the colored handles to connect nodes</span>
      </div>

      {showForm && (
        <form onSubmit={createLink} className="bg-surface border border-border rounded-xl p-4 mb-3 grid grid-cols-3 gap-3">
          {[["source_device_id","Source"],["target_device_id","Target"]].map(([k,l]) => (
            <div key={k}>
              <label className="block text-xs text-muted mb-1">{l}</label>
              <select value={form[k]} onChange={e => setForm(f => ({...f,[k]:e.target.value}))} required
                className="w-full bg-bg border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent">
                <option value="">Select…</option>
                {devices.map(d => <option key={d.id} value={d.id}>{d.hostname}</option>)}
              </select>
            </div>
          ))}
          <div>
            <label className="block text-xs text-muted mb-1">Type</label>
            <select value={form.link_type} onChange={e => setForm(f => ({...f,link_type:e.target.value}))}
              className="w-full bg-bg border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent">
              {["ethernet","fiber","wireless","vpn","other"].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          {[["source_port","Src Port"],["target_port","Dst Port"]].map(([k,l]) => (
            <div key={k}>
              <label className="block text-xs text-muted mb-1">{l} (optional)</label>
              <input value={form[k]} onChange={e => setForm(f => ({...f,[k]:e.target.value}))} placeholder="e.g. Gi0/0"
                className="w-full bg-bg border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent" />
            </div>
          ))}
          <div className="col-span-3 flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs text-muted border border-border rounded-lg">Cancel</button>
            <button type="submit" className="px-3 py-1.5 text-xs bg-accent text-white rounded-lg">Create</button>
          </div>
        </form>
      )}

      {/* Legend */}
      <div className="flex gap-4 mb-3 flex-wrap">
        {Object.entries(ICONS).map(([type, Icon]) => (
          <div key={type} className="flex items-center gap-1">
            <Icon color={TCOLOR[type]}/>
            <span className="text-[10px] text-muted capitalize">{type}</span>
          </div>
        ))}
      </div>

      {/* Canvas */}
      <div id="topology-print-root" className="relative h-[calc(100vh-17rem)] bg-[#0e1018] border border-border rounded-xl overflow-hidden">
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
          panOnScroll
          selectionOnDrag
        >
          <Background color="#1c1f2e" gap={24} size={1}/>
          <Controls className="!bg-surface !border-border !rounded-lg"/>
          <MiniMap nodeColor={n => SCOLOR[n.data?.status] || SCOLOR.unknown} className="!bg-surface !border-border !rounded-lg" maskColor="#0e1018bb"/>
        </ReactFlow>

        {/* Device info panel */}
        {selected && !selected._edge && (
          <div className="absolute top-4 right-4 bg-surface border border-border rounded-xl p-4 w-64 shadow-2xl z-10">
            <div className="flex items-center gap-2 mb-3">
              {(() => { const Icon = ICONS[selected.device_type]||OtherSVG; return <Icon color={TCOLOR[selected.device_type]||"#6b7280"}/>; })()}
              <div className="flex-1 min-w-0">
                <div className="font-mono font-semibold text-white text-sm truncate">{selected.hostname}</div>
                <div className="text-xs text-muted font-mono">{selected.ip_address}</div>
              </div>
              <button onClick={() => setSelected(null)} className="text-muted hover:text-white shrink-0">✕</button>
            </div>
            <div className="space-y-1 text-xs mb-3">
              {[["Type",selected.device_type],["Vendor",selected.vendor||"—"],["OS",selected.os_version||"—"],["Location",selected.location||"—"],["Status",selected.status]].map(([k,v]) => (
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
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {links.filter(l => l.source_device_id===selected.id||l.target_device_id===selected.id).map(l => {
                const otherId = l.source_device_id===selected.id ? l.target_device_id : l.source_device_id;
                const other = devices.find(d => d.id===otherId);
                return (
                  <div key={l.id} className="flex items-center justify-between text-xs text-muted bg-white/5 rounded px-2 py-1">
                    <span className="truncate">{other?.hostname||`#${otherId}`}{l.link_type ? ` · ${l.link_type}` : ""}</span>
                    <button onClick={() => deleteLink(l.id)} className="hover:text-red-400 ml-1 shrink-0 transition-colors"><Trash2 size={11}/></button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Edge info panel */}
        {selected?._edge && (
          <div className="absolute top-4 right-4 bg-surface border border-border rounded-xl p-4 w-52 shadow-2xl z-10">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm text-white font-medium">Link #{selected.linkId}</span>
              <button onClick={() => setSelected(null)} className="text-muted hover:text-white">✕</button>
            </div>
            <button onClick={() => deleteLink(selected.linkId)}
              className="w-full py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5">
              <Trash2 size={11}/> Delete Link
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
