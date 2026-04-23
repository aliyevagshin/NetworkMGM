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
import { Plus, Trash2, Save, FileDown, X, Network } from "lucide-react";
import { format } from "date-fns";

/* ─── Cable types ─── */
const CABLE_TYPES = {
  ethernet: { label: "Ethernet",  color: "#4f7cff", dash: null },
  fiber:    { label: "Fiber",     color: "#f97316", dash: null },
  serial:   { label: "Serial",    color: "#eab308", dash: "8 4" },
  wireless: { label: "Wireless",  color: "#22c55e", dash: "5 5" },
  vpn:      { label: "VPN",       color: "#a855f7", dash: "10 4 2 4" },
};

/* ─── Default ports per device type ─── */
const DEFAULT_PORTS = {
  router:   ["Gi0/0","Gi0/1","Gi0/2","Gi0/3","Gi0/4","Gi0/5"],
  switch:   Array.from({length:24},(_,i)=>`Fa0/${i+1}`),
  firewall: ["eth0(WAN)","eth1","eth2","eth3"],
  ap:       ["eth0","wlan0"],
  server:   ["eth0","eth1"],
  cloud:    ["link0","link1","link2","link3"],
  sdwan:    ["WAN1","WAN2","LAN1","LAN2"],
  other:    ["port0","port1","port2","port3"],
};

const DEVICE_TYPES = ["router","switch","firewall","ap","server","cloud","sdwan","other"];

/* ─── SVG Icons ─── */
const RouterSVG = ({ color, size=36 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <circle cx="20" cy="20" r="14" stroke={color} strokeWidth="2.2"/>
    <circle cx="20" cy="20" r="6"  stroke={color} strokeWidth="1.8"/>
    <line x1="20" y1="6"  x2="20" y2="14" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    <line x1="20" y1="26" x2="20" y2="34" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    <line x1="6"  y1="20" x2="14" y2="20" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    <line x1="26" y1="20" x2="34" y2="20" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    <line x1="10" y1="10" x2="15.5" y2="15.5" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="30" y1="10" x2="24.5" y2="15.5" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="10" y1="30" x2="15.5" y2="24.5" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="30" y1="30" x2="24.5" y2="24.5" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
const SwitchSVG = ({ color, size=36 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <rect x="2" y="14" width="36" height="12" rx="3" stroke={color} strokeWidth="2.2"/>
    <rect x="5" y="17" width="4" height="6" rx="1" stroke={color} strokeWidth="1.4"/>
    <rect x="11" y="17" width="4" height="6" rx="1" stroke={color} strokeWidth="1.4"/>
    <rect x="17" y="17" width="4" height="6" rx="1" stroke={color} strokeWidth="1.4"/>
    <rect x="23" y="17" width="4" height="6" rx="1" stroke={color} strokeWidth="1.4"/>
    <rect x="29" y="17" width="4" height="6" rx="1" stroke={color} strokeWidth="1.4"/>
    <circle cx="36" cy="20" r="1.5" fill={color}/>
    <line x1="8"  y1="14" x2="6"  y2="8"  stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    <line x1="32" y1="14" x2="34" y2="8"  stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    <line x1="20" y1="26" x2="20" y2="33" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    <line x1="16" y1="33" x2="24" y2="33" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);
const FirewallSVG = ({ color, size=36 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <path d="M20 3 L35 8 L35 25 Q35 34 20 37 Q5 34 5 25 L5 8 Z" stroke={color} strokeWidth="2.2"/>
    <line x1="5"  y1="15" x2="35" y2="15" stroke={color} strokeWidth="1.4" opacity="0.7"/>
    <line x1="5"  y1="22" x2="35" y2="22" stroke={color} strokeWidth="1.4" opacity="0.7"/>
    <line x1="20" y1="8"  x2="20" y2="34" stroke={color} strokeWidth="1.4" opacity="0.7"/>
    <path d="M13 11 L17 15 L13 19" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  </svg>
);
const APSVG = ({ color, size=36 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <circle cx="20" cy="28" r="4" fill={color}/>
    <path d="M10 22 Q20 12 30 22" stroke={color} strokeWidth="2.2" strokeLinecap="round" fill="none"/>
    <path d="M4 16 Q20 4 36 16"   stroke={color} strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.55"/>
    <line x1="20" y1="28" x2="20" y2="37" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <line x1="14" y1="37" x2="26" y2="37" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);
const ServerSVG = ({ color, size=36 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <rect x="4" y="5"  width="32" height="9" rx="2" stroke={color} strokeWidth="2.2"/>
    <rect x="4" y="16" width="32" height="9" rx="2" stroke={color} strokeWidth="2.2"/>
    <rect x="4" y="27" width="32" height="9" rx="2" stroke={color} strokeWidth="2.2"/>
    <circle cx="31" cy="9.5"  r="2" fill={color}/>
    <circle cx="31" cy="20.5" r="2" fill={color}/>
    <circle cx="31" cy="31.5" r="2" fill={color}/>
    <line x1="8"  y1="9.5"  x2="22" y2="9.5"  stroke={color} strokeWidth="1.4" opacity="0.5" strokeLinecap="round"/>
    <line x1="8"  y1="20.5" x2="22" y2="20.5" stroke={color} strokeWidth="1.4" opacity="0.5" strokeLinecap="round"/>
    <line x1="8"  y1="31.5" x2="22" y2="31.5" stroke={color} strokeWidth="1.4" opacity="0.5" strokeLinecap="round"/>
  </svg>
);
const CloudSVG = ({ color, size=36 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <path d="M10 30 Q3 30 3 22 Q3 16 9 14 Q8 7 16 6 Q22 6 25 11 Q30 9 33 14 Q39 14 38 21 Q38 30 30 30 Z" stroke={color} strokeWidth="2.2"/>
    <line x1="14" y1="20" x2="20" y2="26" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    <line x1="20" y1="20" x2="20" y2="26" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    <line x1="26" y1="20" x2="20" y2="26" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);
const SdWanSVG = ({ color, size=36 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <ellipse cx="20" cy="20" rx="14" ry="11" stroke={color} strokeWidth="2.2"/>
    <ellipse cx="20" cy="20" rx="7"  ry="11" stroke={color} strokeWidth="1.4" opacity="0.7"/>
    <line x1="6" y1="20" x2="34" y2="20" stroke={color} strokeWidth="1.4" opacity="0.7"/>
    <line x1="20" y1="9" x2="20" y2="31" stroke={color} strokeWidth="1.4" opacity="0.7"/>
    <path d="M2 15 L6 20 L2 25"  stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <path d="M38 15 L34 20 L38 25" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <circle cx="20" cy="20" r="2.5" fill={color}/>
  </svg>
);
const OtherSVG = ({ color, size=36 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <rect x="4" y="4" width="32" height="32" rx="5" stroke={color} strokeWidth="2.2"/>
    <line x1="13" y1="14" x2="27" y2="14" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    <line x1="13" y1="20" x2="27" y2="20" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    <line x1="13" y1="26" x2="21" y2="26" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    <circle cx="29" cy="26" r="2.5" stroke={color} strokeWidth="1.6"/>
  </svg>
);

const DEVICE_ICONS  = { router: RouterSVG, switch: SwitchSVG, firewall: FirewallSVG, ap: APSVG, server: ServerSVG, cloud: CloudSVG, sdwan: SdWanSVG, other: OtherSVG };
const DEVICE_COLORS = { router: "#4f7cff", switch: "#22c55e", firewall: "#ef4444", ap: "#f59e0b", server: "#8b5cf6", cloud: "#6b7280", sdwan: "#06b6d4", other: "#94a3b8" };

/* ─── Custom node — ports as handles distributed along edges ─── */
function DiagramNode({ id, data, selected }) {
  const Icon  = DEVICE_ICONS[data.device_type]  || OtherSVG;
  const color = DEVICE_COLORS[data.device_type] || "#94a3b8";
  const ports = data.ports || DEFAULT_PORTS[data.device_type] || [];

  // Split into top-row and bottom-row for large port counts
  const topPorts = ports.length > 8 ? ports.slice(0, Math.ceil(ports.length / 2)) : [];
  const btmPorts = ports.length > 8 ? ports.slice(Math.ceil(ports.length / 2)) : ports;

  const handleStyle = (i, total, pos) => ({
    [pos === "top" ? "top" : "bottom"]: -5,
    left: `${((i + 0.5) / total) * 100}%`,
    transform: "translateX(-50%)",
    width: 7, height: 7,
    background: color,
    border: "2px solid #0d0f17",
    borderRadius: "50%",
    cursor: "crosshair",
  });

  return (
    <div
      onClick={() => data.onSelect?.(id)}
      style={{ border: `2px solid ${selected ? color : color + "50"}`, boxShadow: selected ? `0 0 14px ${color}55` : `0 0 6px ${color}18` }}
      className="bg-[#13151f] rounded-xl px-3 pt-2.5 pb-3 cursor-pointer select-none transition-all"
      title={ports.join(", ")}
    >
      {/* Top-row port handles */}
      {topPorts.map((p, i) => (
        <Handle key={p} type="source" position={Position.Top} id={p} style={handleStyle(i, topPorts.length, "top")} title={p} />
      ))}
      {/* Bottom-row port handles */}
      {btmPorts.map((p, i) => (
        <Handle key={p} type="source" position={Position.Bottom} id={p} style={handleStyle(i, btmPorts.length, "bottom")} title={p} />
      ))}
      {/* Also allow target on all sides for any-to-any connections */}
      {["top","right","bottom","left"].map((side) => (
        <Handle key={side+"-t"} type="target" position={Position[side.charAt(0).toUpperCase()+side.slice(1)]} id={side+"-t"} style={{ opacity:0, width:8, height:8 }} />
      ))}

      <div className="flex flex-col items-center gap-1">
        <Icon color={color} size={30} />
        <div className="text-[11px] font-mono text-white font-semibold truncate max-w-[130px] text-center">{data.label || data.device_type}</div>
        {data.ip && <div className="text-[10px] font-mono text-muted">{data.ip}</div>}
        {/* Port count indicator */}
        <div className="text-[9px] text-muted/50">{ports.length} ports</div>
      </div>

      {/* Visible port dots row(s) */}
      {topPorts.length > 0 && (
        <div className="flex justify-center gap-[3px] mt-1.5 pt-1 border-t border-white/5">
          {topPorts.map((p) => (
            <div key={p} title={p} className="w-[6px] h-[6px] rounded-full" style={{ background: color + "80" }} />
          ))}
        </div>
      )}
      <div className="flex justify-center gap-[3px] mt-1 pb-1">
        {btmPorts.map((p) => (
          <div key={p} title={p} className="w-[6px] h-[6px] rounded-full" style={{ background: color + "80" }} />
        ))}
      </div>
    </div>
  );
}

/* ─── Custom edge — cable type controls color/dash ─── */
function CableEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, style, selected }) {
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const ct = CABLE_TYPES[data?.cable_type] || CABLE_TYPES.ethernet;
  const edgeStyle = { ...style, strokeWidth: selected ? 2.5 : 1.8, stroke: ct.color, strokeDasharray: ct.dash || undefined };
  return (
    <>
      <path id={id} style={edgeStyle} className="react-flow__edge-path" d={path} markerEnd={markerEnd} />
      {(data?.label || data?.src_port || data?.dst_port) && (
        <EdgeLabelRenderer>
          <div style={{ position:"absolute", transform:`translate(-50%,-50%) translate(${lx}px,${ly}px)`, pointerEvents:"all" }}
            className="text-[9px] font-mono bg-[#13151f] border border-white/10 rounded px-1 py-0.5 whitespace-nowrap"
            style={{ color: ct.color }}>
            {data.label || [data.src_port, data.dst_port].filter(Boolean).join(" ↔ ")}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { diagram: DiagramNode };
const edgeTypes = { cable: CableEdge };

/* ─── Canvas ─── */
function TopologyCanvas({ topoId, topoName, onSaved, onDeleted, onNameChange, activeCableType = "ethernet" }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedId, setSelectedId]   = useState(null);
  const [exporting, setExporting]     = useState(false);
  const [saveState, setSaveState]     = useState("saved"); // saved | saving | unsaved
  const { screenToFlowPosition, fitView } = useReactFlow();
  const flowRef  = useRef(null);
  const timerRef = useRef(null);

  // Refs that auto-save closure can read without going stale
  const currentIdRef  = useRef(topoId);
  const nodesRef      = useRef([]);
  const edgesRef      = useRef([]);
  const nameRef       = useRef(topoName);
  const cableTypeRef  = useRef(activeCableType);
  const onSavedRef    = useRef(onSaved);
  useEffect(() => { currentIdRef.current  = topoId;          }, [topoId]);
  useEffect(() => { nodesRef.current      = nodes;           }, [nodes]);
  useEffect(() => { edgesRef.current      = edges;           }, [edges]);
  useEffect(() => { nameRef.current       = topoName;        }, [topoName]);
  useEffect(() => { cableTypeRef.current  = activeCableType; }, [activeCableType]);
  useEffect(() => { onSavedRef.current    = onSaved;         }, [onSaved]);

  /* load topology when topoId prop changes */
  useEffect(() => {
    currentIdRef.current = topoId;
    if (!topoId) { setNodes([]); setEdges([]); setSaveState("unsaved"); return; }
    topologiesAPI.get(topoId).then((r) => {
      try {
        const { nodes: ns = [], edges: es = [] } = JSON.parse(r.data.data || "{}");
        setNodes(ns.map((n) => ({ ...n, data: { ...n.data, onSelect: setSelectedId } })));
        setEdges(es);
      } catch { setNodes([]); setEdges([]); }
      setSaveState("saved");
      setSelectedId(null);
    });
  }, [topoId]);

  /* debounced auto-save */
  const triggerSave = useCallback(() => {
    setSaveState("unsaved");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setSaveState("saving");
      const data = JSON.stringify({
        nodes: nodesRef.current.map(({ data: { onSelect, ...rest }, ...n }) => ({ ...n, data: rest })),
        edges: edgesRef.current,
      });
      try {
        if (currentIdRef.current) {
          await topologiesAPI.update(currentIdRef.current, { name: nameRef.current, data });
        } else {
          const r = await topologiesAPI.create({ name: nameRef.current });
          const newId = r.data.id;
          currentIdRef.current = newId;
          await topologiesAPI.update(newId, { data });
          onSavedRef.current(newId, nameRef.current);
        }
        setSaveState("saved");
      } catch { setSaveState("unsaved"); }
    }, 1500);
  }, []);

  const markDirty = useCallback(() => triggerSave(), [triggerSave]);

  /* drag-drop from palette */
  const onDragOver = useCallback((e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }, []);
  const onDrop = useCallback((e) => {
    e.preventDefault();
    const deviceType = e.dataTransfer.getData("application/nms-device-type");
    if (!deviceType) return;
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const node = {
      id: `n_${Date.now()}`,
      type: "diagram",
      position: pos,
      data: {
        device_type: deviceType,
        label: deviceType.charAt(0).toUpperCase() + deviceType.slice(1),
        ip: "",
        notes: "",
        ports: [...(DEFAULT_PORTS[deviceType] || [])],
        onSelect: setSelectedId,
      },
    };
    setNodes((ns) => ns.concat(node));
    triggerSave();
  }, [screenToFlowPosition, triggerSave]);

  const onConnect = useCallback((params) => {
    const srcPort = params.sourceHandle && !params.sourceHandle.endsWith("-t") ? params.sourceHandle : null;
    const dstPort = params.targetHandle && !params.targetHandle.endsWith("-t") ? params.targetHandle : null;
    setEdges((es) => es.concat({
      id: `e_${Date.now()}`,
      source: params.source, target: params.target,
      sourceHandle: params.sourceHandle, targetHandle: params.targetHandle,
      type: "cable",
      data: { cable_type: cableTypeRef.current, src_port: srcPort, dst_port: dstPort, label: "" },
    }));
    triggerSave();
  }, [triggerSave]);

  const onEdgeClick = useCallback((_, edge) => {
    const label = prompt("Edge label (leave blank to clear):", edge.data?.label || "");
    if (label === null) return;
    setEdges((es) => es.map((e) => e.id === edge.id ? { ...e, data: { ...e.data, label } } : e));
    triggerSave();
  }, [triggerSave]);

  const updateNode = useCallback((id, patch) => {
    setNodes((ns) => ns.map((n) => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n));
    triggerSave();
  }, [triggerSave]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    setNodes((ns) => ns.filter((n) => n.id !== selectedId));
    setEdges((es) => es.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
    triggerSave();
  }, [selectedId, triggerSave]);

  const exportPDF = async () => {
    if (!flowRef.current) return;
    setExporting(true);
    toast.loading("Generating PDF…", { id: "pdf" });
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"), import("jspdf"),
      ]);
      fitView({ padding: 0.1, duration: 0 });
      await new Promise((r) => setTimeout(r, 200));
      const canvas = await html2canvas(flowRef.current, { backgroundColor: "#0e1018", scale: 2, useCORS: true, logging: false });
      const pdf = new jsPDF({ orientation: canvas.width > canvas.height ? "landscape" : "portrait", unit: "mm", format: "a4" });
      const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
      const ratio = Math.min(pw / canvas.width, ph / canvas.height);
      const dw = canvas.width * ratio, dh = canvas.height * ratio;
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", (pw-dw)/2, (ph-dh)/2, dw, dh);
      pdf.setFontSize(8); pdf.setTextColor(120,120,140);
      pdf.text(`${topoName} — ${nodes.length} nodes, ${edges.length} links`, 6, ph-4);
      pdf.text(new Date().toLocaleString(), pw-6, ph-4, { align:"right" });
      pdf.save(`${topoName.replace(/\s+/g,"_")}_${new Date().toISOString().slice(0,10)}.pdf`);
      toast.success("PDF exported", { id: "pdf" });
    } catch { toast.error("Export failed", { id: "pdf" }); }
    setExporting(false);
  };

  const deleteTopo = async () => {
    if (!currentIdRef.current) return;
    if (!confirm(`Delete topology "${topoName}"?`)) return;
    await topologiesAPI.delete(currentIdRef.current);
    toast.success("Deleted");
    onDeleted();
  };

  const selectedNode = nodes.find((n) => n.id === selectedId);

  const saveIndicator = { saved: <span className="text-[10px] text-green-400">✓ saved</span>, saving: <span className="text-[10px] text-amber-400 animate-pulse">saving…</span>, unsaved: <span className="text-[10px] text-amber-400">● unsaved</span> }[saveState];

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <input value={topoName} onChange={(e) => { onNameChange(e.target.value); triggerSave(); }}
          className="bg-transparent border-b border-border text-white text-sm font-semibold px-1 py-0.5 focus:outline-none focus:border-accent w-44"
          placeholder="Topology name…" />
        {saveIndicator}
        <button onClick={exportPDF} disabled={exporting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 rounded-lg transition-colors disabled:opacity-50 ml-1">
          <FileDown size={12} className={exporting?"animate-pulse":""}/> PDF
        </button>
        {currentIdRef.current && (
          <button onClick={deleteTopo}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors ml-auto">
            <Trash2 size={12}/> Delete
          </button>
        )}
        <span className="text-[10px] text-muted/60 ml-1 hidden sm:inline">drag icons from palette · connect port dots · click edge to label</span>
      </div>

      <div className="flex flex-1 gap-3 min-h-0">
        {/* ReactFlow canvas */}
        <div ref={flowRef} className="flex-1 bg-[#0e1018] border border-border rounded-xl overflow-hidden" style={{minHeight:0}}>
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={(c) => { onNodesChange(c); if (c.some((x) => x.type === "remove")) triggerSave(); }}
            onEdgesChange={(c) => { onEdgesChange(c); if (c.some((x) => x.type === "remove")) triggerSave(); }}
            onNodeDragStop={markDirty}
            onConnect={onConnect}
            onEdgeClick={onEdgeClick}
            onDrop={onDrop} onDragOver={onDragOver}
            nodeTypes={nodeTypes} edgeTypes={edgeTypes}
            connectionMode="loose" fitView deleteKeyCode="Delete"
          >
            <Background color="#1a1d2e" gap={24} size={1} />
            <Controls className="!bg-surface !border-border" />
            <MiniMap nodeColor={(n) => DEVICE_COLORS[n.data?.device_type]||"#94a3b8"}
              className="!bg-surface !border-border" maskColor="#0e1018cc" />
          </ReactFlow>
        </div>

        {/* Properties panel */}
        {selectedNode && (
          <div className="w-56 bg-surface border border-border rounded-xl p-3 flex flex-col gap-2.5 shrink-0 overflow-y-auto">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white">Properties</span>
              <button onClick={() => setSelectedId(null)} className="text-muted hover:text-white"><X size={13}/></button>
            </div>
            {/* Type */}
            <div>
              <label className="text-[10px] text-muted mb-1 block">Type</label>
              <select value={selectedNode.data.device_type}
                onChange={(e) => updateNode(selectedNode.id, { device_type: e.target.value, ports: [...(DEFAULT_PORTS[e.target.value]||[])] })}
                className="w-full bg-bg border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent">
                {DEVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {/* Label */}
            <div>
              <label className="text-[10px] text-muted mb-1 block">Label</label>
              <input value={selectedNode.data.label||""} onChange={(e) => updateNode(selectedNode.id, { label: e.target.value })}
                className="w-full bg-bg border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent" placeholder="Device name…"/>
            </div>
            {/* IP */}
            <div>
              <label className="text-[10px] text-muted mb-1 block">IP Address</label>
              <input value={selectedNode.data.ip||""} onChange={(e) => updateNode(selectedNode.id, { ip: e.target.value })}
                className="w-full bg-bg border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent" placeholder="192.168.1.1"/>
            </div>
            {/* Ports editor */}
            <div>
              <label className="text-[10px] text-muted mb-1 block">Ports (one per line)</label>
              <textarea
                value={(selectedNode.data.ports||[]).join("\n")}
                onChange={(e) => updateNode(selectedNode.id, { ports: e.target.value.split("\n").map((s)=>s.trim()).filter(Boolean) })}
                rows={Math.min((selectedNode.data.ports||[]).length + 1, 8)}
                className="w-full bg-bg border border-border rounded-lg px-2 py-1.5 text-[10px] font-mono text-white focus:outline-none focus:border-accent resize-y"
              />
            </div>
            {/* Notes */}
            <div>
              <label className="text-[10px] text-muted mb-1 block">Notes</label>
              <textarea value={selectedNode.data.notes||""} onChange={(e) => updateNode(selectedNode.id, { notes: e.target.value })}
                rows={2} className="w-full bg-bg border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent resize-none" placeholder="Optional…"/>
            </div>
            <button onClick={deleteSelected}
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
  const [activeId,   setActiveId]   = useState(null);
  const [activeName, setActiveName] = useState("New Topology");
  const [hasCanvas,  setHasCanvas]  = useState(false);

  const loadList = useCallback(() => topologiesAPI.list().then((r) => setTopologies(r.data)), []);
  useEffect(() => { loadList(); }, []);

  const openTopology = (t) => { setActiveId(t.id); setActiveName(t.name); setHasCanvas(true); };
  const newTopology  = ()  => { setActiveId(null); setActiveName("New Topology"); setHasCanvas(true); };
  const onSaved = useCallback((id, name) => { setActiveId(id); setActiveName(name); loadList(); }, [loadList]);
  const onDeleted = useCallback(() => { setActiveId(null); setActiveName("New Topology"); setHasCanvas(false); loadList(); }, [loadList]);

  return (
    <Layout title="Topology">
      <div className="flex gap-3 h-[calc(100vh-8rem)]">

        {/* ── Left sidebar ── */}
        <div className="w-44 shrink-0 flex flex-col gap-3">
          <button onClick={newTopology}
            className="flex items-center justify-center gap-1.5 py-2 bg-accent/10 hover:bg-accent/20 text-accent text-xs rounded-lg border border-accent/20 transition-colors">
            <Plus size={13}/> New Topology
          </button>

          {/* Saved list */}
          <div className="flex flex-col min-h-0" style={{maxHeight:"28%",overflowY:"auto"}}>
            <div className="text-[10px] text-muted uppercase tracking-wider mb-1.5 px-0.5">Saved</div>
            {topologies.length === 0 && <div className="text-[11px] text-muted/60 px-0.5">No topologies yet</div>}
            {topologies.map((t) => (
              <button key={t.id} onClick={() => openTopology(t)}
                className={`w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors mb-0.5 flex items-start gap-1.5
                  ${activeId===t.id ? "bg-accent/15 text-white" : "text-muted hover:text-white hover:bg-white/5"}`}>
                <Network size={11} className="shrink-0 mt-0.5"/>
                <div className="min-w-0">
                  <div className="font-medium truncate">{t.name}</div>
                  <div className="text-[9px] opacity-50">{format(new Date(t.updated_at),"MM-dd HH:mm")}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Device palette */}
          <div className="shrink-0">
            <div className="text-[10px] text-muted uppercase tracking-wider mb-1 px-0.5">Devices</div>
            <div className="text-[9px] text-muted/50 px-0.5 mb-1.5">drag onto canvas</div>
            <div className="grid grid-cols-2 gap-1">
              {DEVICE_TYPES.map((type) => {
                const Icon  = DEVICE_ICONS[type];
                const color = DEVICE_COLORS[type];
                return (
                  <div key={type} draggable
                    onDragStart={(e) => { e.dataTransfer.setData("application/nms-device-type", type); e.dataTransfer.effectAllowed = "move"; }}
                    className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg border border-border cursor-grab hover:border-accent/40 hover:bg-white/5 transition-all select-none active:cursor-grabbing"
                    title={`Drag to add ${type}`}>
                    <Icon color={color} size={22}/>
                    <span className="text-[9px] text-muted capitalize">{type}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cable type selector */}
          <div className="shrink-0 mt-1">
            <div className="text-[10px] text-muted uppercase tracking-wider mb-1.5 px-0.5">Cable Type</div>
            <div id="cable-type-context" className="flex flex-col gap-1">
              {Object.entries(CABLE_TYPES).map(([key, ct]) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer group px-1 py-0.5 rounded hover:bg-white/5 transition-colors">
                  <input type="radio" name="cable-palette" value={key} className="hidden peer"/>
                  <span className="w-2.5 h-2.5 rounded-full shrink-0 peer-checked:ring-2 ring-offset-1 ring-offset-bg"
                    style={{ background: ct.color, ...(ct.dash ? { backgroundImage: "none" } : {}) }}/>
                  <span className="text-[11px] text-muted group-hover:text-white transition-colors">{ct.label}</span>
                  {ct.dash && <span className="text-[9px] text-muted/50 ml-auto">dashed</span>}
                </label>
              ))}
            </div>
            {/* Actual cable selection is managed inside TopologyCanvas — wire it via context later if needed */}
            <div className="text-[9px] text-muted/40 px-1 mt-1">select in canvas toolbar</div>
          </div>
        </div>

        {/* ── Canvas ── */}
        <div className="flex-1 flex flex-col min-w-0">
          {!hasCanvas ? (
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
              <TopologyInnerWithCableType
                topoId={activeId} topoName={activeName}
                onSaved={onSaved} onDeleted={onDeleted} onNameChange={setActiveName}
              />
            </ReactFlowProvider>
          )}
        </div>
      </div>
    </Layout>
  );
}

/* Wrapper that adds cable-type selection into canvas toolbar */
function TopologyInnerWithCableType(props) {
  const [cableType, setCableType] = useState("ethernet");
  return (
    <div className="flex flex-col h-full gap-0">
      {/* Cable type quick-select bar */}
      <div className="flex items-center gap-1 mb-2 flex-wrap shrink-0">
        <span className="text-[10px] text-muted mr-1">Cable:</span>
        {Object.entries(CABLE_TYPES).map(([key, ct]) => (
          <button key={key} onClick={() => setCableType(key)}
            style={{ borderColor: cableType === key ? ct.color : "transparent", color: cableType === key ? ct.color : undefined }}
            className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${cableType===key?"bg-white/5 font-semibold":"text-muted hover:text-white"}`}>
            <span className="inline-block w-3 h-0.5 mr-1 align-middle rounded"
              style={{ background: ct.color, ...(ct.dash ? {backgroundImage:`repeating-linear-gradient(90deg,${ct.color} 0,${ct.color} 4px,transparent 4px,transparent 8px)`,background:"none"} : {}) }}/>
            {ct.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        <TopologyCanvas {...props} activeCableType={cableType} />
      </div>
    </div>
  );
}
