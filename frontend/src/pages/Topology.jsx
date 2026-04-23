import { useEffect, useState, useCallback, useRef } from "react";
import ReactFlow, {
  Background, Controls, MiniMap,
  useNodesState, useEdgesState,
  EdgeLabelRenderer, getBezierPath, Handle, Position,
  useReactFlow, ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";
import Layout from "../components/Layout";
import { topologiesAPI } from "../api";
import toast from "react-hot-toast";
import { Plus, Trash2, Save, FileDown, X, Edit2, Network } from "lucide-react";
import { format } from "date-fns";

/* ─── SVG Icons ─── */
const RouterSVG = ({ color, size = 36 }) => (
  <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
    <circle cx="18" cy="18" r="10" stroke={color} strokeWidth="2.5"/>
    <line x1="18" y1="4" x2="18" y2="8" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <line x1="18" y1="28" x2="18" y2="32" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <line x1="4" y1="18" x2="8" y2="18" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <line x1="28" y1="18" x2="32" y2="18" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <path d="M13 15 L18 18 L13 21" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <path d="M23 15 L18 18 L23 21" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  </svg>
);
const SwitchSVG = ({ color, size = 36 }) => (
  <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
    <rect x="2" y="11" width="32" height="14" rx="3" stroke={color} strokeWidth="2.5"/>
    {[7,12,18,24,29].map((x) => <circle key={x} cx={x} cy="18" r="2" fill={color}/>)}
    <line x1="9" y1="11" x2="9" y2="5" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <line x1="27" y1="11" x2="27" y2="5" stroke={color} strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
const FirewallSVG = ({ color, size = 36 }) => (
  <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
    <path d="M18 2 L32 7 L32 22 Q32 30 18 34 Q4 30 4 22 L4 7 Z" stroke={color} strokeWidth="2.5"/>
    {[11,17,23].map((y) => <line key={y} x1="11" y1={y} x2="25" y2={y} stroke={color} strokeWidth="1.5" opacity="0.65"/>)}
    <line x1="18" y1="7" x2="18" y2="29" stroke={color} strokeWidth="1.5" opacity="0.65"/>
  </svg>
);
const APSVG = ({ color, size = 36 }) => (
  <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
    <circle cx="18" cy="26" r="4" fill={color}/>
    <path d="M9 20 Q18 10 27 20" stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none"/>
    <path d="M3 14 Q18 2 33 14" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.6"/>
    <line x1="18" y1="26" x2="18" y2="34" stroke={color} strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
const ServerSVG = ({ color, size = 36 }) => (
  <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
    <rect x="3" y="4"  width="30" height="8"  rx="2" stroke={color} strokeWidth="2.5"/>
    <rect x="3" y="14" width="30" height="8"  rx="2" stroke={color} strokeWidth="2.5"/>
    <rect x="3" y="24" width="30" height="8"  rx="2" stroke={color} strokeWidth="2.5"/>
    <circle cx="28" cy="8"  r="1.5" fill={color}/>
    <circle cx="28" cy="18" r="1.5" fill={color}/>
    <circle cx="28" cy="28" r="1.5" fill={color}/>
  </svg>
);
const CloudSVG = ({ color, size = 36 }) => (
  <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
    <path d="M9 28 Q3 28 3 20 Q3 14 9 13 Q9 6 17 6 Q23 6 25 11 Q30 10 32 16 Q36 16 36 22 Q36 28 30 28 Z" stroke={color} strokeWidth="2.5"/>
  </svg>
);
const OtherSVG = ({ color, size = 36 }) => (
  <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
    <rect x="4" y="4" width="28" height="28" rx="4" stroke={color} strokeWidth="2.5"/>
    <line x1="12" y1="13" x2="24" y2="13" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <line x1="12" y1="18" x2="24" y2="18" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <line x1="12" y1="23" x2="20" y2="23" stroke={color} strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const DEVICE_ICONS  = { router: RouterSVG, switch: SwitchSVG, firewall: FirewallSVG, ap: APSVG, server: ServerSVG, cloud: CloudSVG, other: OtherSVG };
const DEVICE_COLORS = { router: "#4f7cff", switch: "#22c55e", firewall: "#ef4444", ap: "#f59e0b", server: "#8b5cf6", cloud: "#6b7280", other: "#94a3b8" };
const DEVICE_TYPES  = ["router", "switch", "firewall", "ap", "server", "cloud", "other"];

/* ─── Custom diagram node (standalone — not linked to DB devices) ─── */
function DiagramNode({ id, data, selected }) {
  const Icon = DEVICE_ICONS[data.device_type] || OtherSVG;
  const color = DEVICE_COLORS[data.device_type] || "#94a3b8";
  return (
    <div
      onClick={() => data.onSelect?.(id)}
      style={{ border: `2px solid ${selected ? color : color + "55"}`, boxShadow: selected ? `0 0 14px ${color}55` : `0 0 6px ${color}22` }}
      className="bg-[#13151f] rounded-xl px-3 py-2.5 min-w-[110px] cursor-pointer select-none transition-all"
    >
      {["top","right","bottom","left"].map((pos) => (
        <Handle key={pos} type="source" position={Position[pos.charAt(0).toUpperCase()+pos.slice(1)]} id={pos}
          style={{ background: color, width: 8, height: 8, border: "2px solid #13151f" }} />
      ))}
      {["top","right","bottom","left"].map((pos) => (
        <Handle key={pos+"-t"} type="target" position={Position[pos.charAt(0).toUpperCase()+pos.slice(1)]} id={pos+"-t"}
          style={{ opacity: 0, width: 8, height: 8 }} />
      ))}
      <div className="flex flex-col items-center gap-1">
        <Icon color={color} size={32} />
        <div className="text-[11px] font-mono text-white font-semibold truncate max-w-[100px] text-center leading-tight">
          {data.label || data.device_type}
        </div>
        {data.ip && <div className="text-[10px] font-mono text-muted">{data.ip}</div>}
      </div>
    </div>
  );
}

/* ─── Custom edge with optional label ─── */
function LabelEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, style, selected }) {
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <>
      <path id={id} style={{ ...style, strokeWidth: selected ? 2.5 : 1.5, stroke: "#4f7cff" }}
        className="react-flow__edge-path" d={path} markerEnd={markerEnd} />
      {data?.label && (
        <EdgeLabelRenderer>
          <div style={{ position:"absolute", transform:`translate(-50%,-50%) translate(${lx}px,${ly}px)`, pointerEvents:"all" }}
            className="text-[9px] font-mono bg-[#13151f] border border-border rounded px-1 py-0.5 text-muted whitespace-nowrap">
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { diagram: DiagramNode };
const edgeTypes = { label: LabelEdge };

/* ─── Inner canvas (needs ReactFlowProvider context) ─── */
function TopologyCanvas({ topoId, topoName, onSaved, onDeleted, onNameChange }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const flowRef = useRef(null);

  /* load topology data when topoId changes */
  useEffect(() => {
    if (!topoId) { setNodes([]); setEdges([]); setDirty(false); return; }
    topologiesAPI.get(topoId).then((r) => {
      try {
        const { nodes: ns, edges: es } = JSON.parse(r.data.data || "{}");
        setNodes((ns || []).map((n) => ({ ...n, data: { ...n.data, onSelect: setSelectedNodeId } })));
        setEdges(es || []);
      } catch { setNodes([]); setEdges([]); }
      setDirty(false);
      setSelectedNodeId(null);
    });
  }, [topoId]);

  const markDirty = useCallback(() => setDirty(true), []);

  /* drag-drop from palette */
  const onDragOver = useCallback((e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }, []);
  const onDrop = useCallback((e) => {
    e.preventDefault();
    const deviceType = e.dataTransfer.getData("application/nms-device-type");
    if (!deviceType) return;
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const newNode = {
      id: `node_${Date.now()}`,
      type: "diagram",
      position,
      data: { device_type: deviceType, label: deviceType.charAt(0).toUpperCase() + deviceType.slice(1), ip: "", notes: "", onSelect: setSelectedNodeId },
    };
    setNodes((ns) => ns.concat(newNode));
    setDirty(true);
  }, [screenToFlowPosition]);

  const onConnect = useCallback((params) => {
    setEdges((es) => es.concat({
      id: `edge_${Date.now()}`,
      source: params.source,
      target: params.target,
      type: "label",
      data: { label: "" },
    }));
    setDirty(true);
  }, []);

  const onEdgeClick = useCallback((_, edge) => {
    const label = prompt("Edge label (leave blank for none):", edge.data?.label || "");
    if (label === null) return;
    setEdges((es) => es.map((e) => e.id === edge.id ? { ...e, data: { ...e.data, label } } : e));
    setDirty(true);
  }, []);

  /* update node properties from side panel */
  const updateNode = useCallback((id, patch) => {
    setNodes((ns) => ns.map((n) => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n));
    setDirty(true);
  }, []);

  const deleteSelectedNode = useCallback(() => {
    if (!selectedNodeId) return;
    setNodes((ns) => ns.filter((n) => n.id !== selectedNodeId));
    setEdges((es) => es.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
    setDirty(true);
  }, [selectedNodeId]);

  /* save to backend */
  const save = async () => {
    setSaving(true);
    const data = JSON.stringify({
      nodes: nodes.map(({ data: { onSelect, ...rest }, ...n }) => ({ ...n, data: rest })),
      edges,
    });
    try {
      if (topoId) {
        await topologiesAPI.update(topoId, { name: topoName, data });
        toast.success("Saved");
      } else {
        const r = await topologiesAPI.create({ name: topoName });
        await topologiesAPI.update(r.data.id, { data });
        onSaved(r.data.id, topoName);
        toast.success("Topology created");
      }
      setDirty(false);
    } catch { toast.error("Save failed"); }
    setSaving(false);
  };

  /* delete topology */
  const deleteTopo = async () => {
    if (!topoId) return;
    if (!confirm(`Delete topology "${topoName}"?`)) return;
    await topologiesAPI.delete(topoId);
    toast.success("Deleted");
    onDeleted();
  };

  /* PDF export */
  const exportPDF = async () => {
    if (!flowRef.current) return;
    setExporting(true);
    toast.loading("Generating PDF…", { id: "pdf" });
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      fitView({ padding: 0.1, duration: 0 });
      await new Promise((r) => setTimeout(r, 200));
      const canvas = await html2canvas(flowRef.current, { backgroundColor: "#0e1018", scale: 2, useCORS: true, logging: false });
      const pdf = new jsPDF({ orientation: canvas.width > canvas.height ? "landscape" : "portrait", unit: "mm", format: "a4" });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const ratio = Math.min(pw / canvas.width, ph / canvas.height);
      const dw = canvas.width * ratio, dh = canvas.height * ratio;
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", (pw-dw)/2, (ph-dh)/2, dw, dh);
      pdf.setFontSize(8); pdf.setTextColor(120,120,140);
      pdf.text(`${topoName} — ${nodes.length} nodes, ${edges.length} links`, 6, ph - 4);
      pdf.text(new Date().toLocaleString(), pw - 6, ph - 4, { align: "right" });
      pdf.save(`${topoName.replace(/\s+/g,"_")}_${new Date().toISOString().slice(0,10)}.pdf`);
      toast.success("PDF exported", { id: "pdf" });
    } catch { toast.error("Export failed", { id: "pdf" }); }
    setExporting(false);
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  return (
    <div className="flex flex-col h-full">
      {/* Canvas toolbar */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <input
          value={topoName}
          onChange={(e) => onNameChange(e.target.value)}
          onBlur={() => dirty && topoId && topologiesAPI.update(topoId, { name: topoName })}
          className="bg-transparent border-b border-border text-white text-sm font-semibold px-1 py-0.5 focus:outline-none focus:border-accent w-48"
          placeholder="Topology name…"
        />
        {dirty && <span className="text-[10px] text-amber-400">● unsaved</span>}
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent/10 hover:bg-accent/20 text-accent rounded-lg transition-colors disabled:opacity-50">
          <Save size={12}/> {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={exportPDF} disabled={exporting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 rounded-lg transition-colors disabled:opacity-50">
          <FileDown size={12} className={exporting ? "animate-pulse" : ""}/> PDF
        </button>
        {topoId && (
          <button onClick={deleteTopo}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors ml-auto">
            <Trash2 size={12}/> Delete
          </button>
        )}
        <span className="text-[10px] text-muted self-center">drag icons from palette · drag handles to connect · click edge to label</span>
      </div>

      {/* ReactFlow + properties panel */}
      <div className="flex flex-1 gap-3 min-h-0">
        <div ref={flowRef} className="flex-1 bg-[#0e1018] border border-border rounded-xl overflow-hidden relative" style={{ minHeight: 0 }}>
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={(changes) => { onNodesChange(changes); markDirty(); }}
            onEdgesChange={(changes) => { onEdgesChange(changes); markDirty(); }}
            onConnect={onConnect}
            onEdgeClick={onEdgeClick}
            onNodeDragStop={markDirty}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes} edgeTypes={edgeTypes}
            connectionMode="loose"
            fitView
            deleteKeyCode="Delete"
          >
            <Background color="#1a1d2e" gap={24} size={1} />
            <Controls className="!bg-surface !border-border" />
            <MiniMap nodeColor={(n) => DEVICE_COLORS[n.data?.device_type] || "#94a3b8"}
              className="!bg-surface !border-border" maskColor="#0e1018cc" />
          </ReactFlow>
        </div>

        {/* Node properties panel */}
        {selectedNode && (
          <div className="w-56 bg-surface border border-border rounded-xl p-4 flex flex-col gap-3 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white">Properties</span>
              <button onClick={() => setSelectedNodeId(null)} className="text-muted hover:text-white"><X size={13}/></button>
            </div>

            <div>
              <label className="text-[10px] text-muted mb-1 block">Type</label>
              <select value={selectedNode.data.device_type}
                onChange={(e) => updateNode(selectedNode.id, { device_type: e.target.value })}
                className="w-full bg-bg border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent">
                {DEVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="text-[10px] text-muted mb-1 block">Label</label>
              <input value={selectedNode.data.label || ""}
                onChange={(e) => updateNode(selectedNode.id, { label: e.target.value })}
                className="w-full bg-bg border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent"
                placeholder="Device name…" />
            </div>

            <div>
              <label className="text-[10px] text-muted mb-1 block">IP Address</label>
              <input value={selectedNode.data.ip || ""}
                onChange={(e) => updateNode(selectedNode.id, { ip: e.target.value })}
                className="w-full bg-bg border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent"
                placeholder="e.g. 192.168.1.1" />
            </div>

            <div>
              <label className="text-[10px] text-muted mb-1 block">Notes</label>
              <textarea value={selectedNode.data.notes || ""}
                onChange={(e) => updateNode(selectedNode.id, { notes: e.target.value })}
                rows={3}
                className="w-full bg-bg border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent resize-none"
                placeholder="Optional notes…" />
            </div>

            <button onClick={deleteSelectedNode}
              className="mt-auto flex items-center justify-center gap-1.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs rounded-lg transition-colors">
              <Trash2 size={11}/> Delete Node
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Topology page ─── */
export default function Topology() {
  const [topologies, setTopologies] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [activeName, setActiveName] = useState("New Topology");
  const [isNew, setIsNew] = useState(false); // unsaved blank canvas

  const loadList = useCallback(async () => {
    const r = await topologiesAPI.list();
    setTopologies(r.data);
  }, []);

  useEffect(() => { loadList(); }, []);

  const openTopology = (t) => {
    setActiveId(t.id);
    setActiveName(t.name);
    setIsNew(false);
  };

  const newTopology = () => {
    setActiveId(null);
    setActiveName("New Topology");
    setIsNew(true);
  };

  const onSaved = (id, name) => {
    setActiveId(id);
    setActiveName(name);
    setIsNew(false);
    loadList();
  };

  const onDeleted = () => {
    setActiveId(null);
    setActiveName("New Topology");
    setIsNew(false);
    loadList();
  };

  return (
    <Layout title="Topology">
      <div className="flex gap-4 h-[calc(100vh-8rem)]">
        {/* ── Left sidebar ── */}
        <div className="w-44 shrink-0 flex flex-col gap-3">
          <button onClick={newTopology}
            className="flex items-center justify-center gap-1.5 py-2 bg-accent/10 hover:bg-accent/20 text-accent text-xs rounded-lg transition-colors border border-accent/20">
            <Plus size={13}/> New Topology
          </button>

          {/* Saved topologies list */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="text-[10px] text-muted uppercase tracking-wider mb-2 px-1">Saved</div>
            {topologies.length === 0 && (
              <div className="text-[11px] text-muted px-1">No topologies yet</div>
            )}
            {topologies.map((t) => (
              <button key={t.id} onClick={() => openTopology(t)}
                className={`w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors mb-1 flex items-start gap-1.5 group
                  ${activeId === t.id ? "bg-accent/15 text-white" : "text-muted hover:text-white hover:bg-white/5"}`}>
                <Network size={11} className="shrink-0 mt-0.5"/>
                <div className="min-w-0">
                  <div className="font-medium truncate">{t.name}</div>
                  <div className="text-[9px] opacity-50">{format(new Date(t.updated_at), "MM-dd HH:mm")}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Device palette */}
          <div className="shrink-0">
            <div className="text-[10px] text-muted uppercase tracking-wider mb-2 px-1">Palette</div>
            <div className="text-[9px] text-muted/60 px-1 mb-2">drag onto canvas</div>
            <div className="grid grid-cols-2 gap-1.5">
              {DEVICE_TYPES.map((type) => {
                const Icon = DEVICE_ICONS[type];
                const color = DEVICE_COLORS[type];
                return (
                  <div key={type}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/nms-device-type", type);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg border border-border cursor-grab hover:border-accent/40 hover:bg-white/5 transition-all select-none active:cursor-grabbing"
                    title={`Drag to add ${type}`}
                  >
                    <Icon color={color} size={24} />
                    <span className="text-[9px] text-muted capitalize">{type}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Canvas area ── */}
        <div className="flex-1 flex flex-col min-w-0">
          {!activeId && !isNew ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted bg-[#0e1018] border border-border rounded-xl">
              <Network size={48} className="mb-4 opacity-20"/>
              <p className="text-sm mb-3">Select a topology or create a new one</p>
              <button onClick={newTopology}
                className="flex items-center gap-2 px-4 py-2 bg-accent/10 hover:bg-accent/20 text-accent text-sm rounded-lg transition-colors">
                <Plus size={14}/> New Topology
              </button>
            </div>
          ) : (
            <ReactFlowProvider>
              <TopologyCanvas
                key={activeId ?? "new"}
                topoId={activeId}
                topoName={activeName}
                onSaved={onSaved}
                onDeleted={onDeleted}
                onNameChange={setActiveName}
              />
            </ReactFlowProvider>
          )}
        </div>
      </div>
    </Layout>
  );
}
