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
import { Plus, Trash2, FileDown, X, Network, ZoomIn, ZoomOut } from "lucide-react";
import { format } from "date-fns";

/* ─── Cable types ─── */
const CABLE_TYPES = {
  ethernet:     { label: "Ethernet",     color: "#4f7cff", dash: null },
  fiber:        { label: "Fiber",        color: "#f97316", dash: null },
  etherchannel: { label: "EtherChannel", color: "#06b6d4", dash: null },
  serial:       { label: "Serial",       color: "#eab308", dash: "8 4" },
  wireless:     { label: "Wireless",     color: "#22c55e", dash: "5 5" },
  vpn:          { label: "VPN",          color: "#a855f7", dash: "10 4 2 4" },
};

/* ─── Default ports ─── */
const DEFAULT_PORTS = {
  router:    ["Gi0/0","Gi0/1","Gi0/2","Gi0/3","Gi0/4","Gi0/5"],
  switch:    Array.from({length:24},(_,i)=>`Gi0/${i+1}`),
  l3switch:  Array.from({length:24},(_,i)=>`Gi0/${i+1}`),
  firewall:  ["eth0","eth1","eth2","eth3","eth4","eth5","eth6","eth7"],
  waf:       ["eth0(WAN)","eth1","eth2","eth3"],
  ap:        ["eth0","wlan0"],
  wlc:       ["Gi0/0","Gi0/1","Gi0/2","Gi0/3"],
  server:    ["eth0","eth1"],
  cloud:     ["link0","link1","link2","link3"],
  sdwan:     ["WAN1","WAN2","LAN1","LAN2"],
  other:     ["port0","port1","port2","port3"],
};

const DEVICE_TYPES = ["router","switch","l3switch","firewall","waf","ap","wlc","server","cloud","sdwan","other"];
const DEVICE_LABELS = { router:"Router", switch:"Switch", l3switch:"L3 Switch", firewall:"Firewall", waf:"WAF", ap:"Access Point", wlc:"WLC", server:"Server", cloud:"Cloud", sdwan:"SD-WAN", other:"Other" };

/* ─── Cisco-style SVG Icons ─── */
// Router: circle with 4 directional arrows (Cisco standard)
const RouterSVG = ({ color, size=36 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <circle cx="20" cy="20" r="13" stroke={color} strokeWidth="2.2"/>
    <path d="M20 7 L20 13" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <path d="M20 27 L20 33" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <path d="M7 20 L13 20" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <path d="M27 20 L33 20" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <path d="M17 7 L20 4 L23 7"   stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <path d="M17 33 L20 36 L23 33" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <path d="M7 17 L4 20 L7 23"   stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <path d="M33 17 L36 20 L33 23" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <circle cx="20" cy="20" r="3.5" fill={color}/>
  </svg>
);

// Switch: Cisco-style box with port slots and uplink arrows
const SwitchSVG = ({ color, size=36 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <rect x="3" y="15" width="34" height="12" rx="2" stroke={color} strokeWidth="2.2"/>
    {[6,10,14,18,22,26,30,34].map((x,i) => (
      <rect key={x} x={x} y="18" width="2.5" height="6" rx="0.5" stroke={color} strokeWidth="1.2" fill={i%2===0 ? color+"30" : "none"}/>
    ))}
    <path d="M11 15 L11 9 M9 11 L11 9 L13 11"  stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M29 15 L29 9 M27 11 L29 9 L31 11" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="36" cy="17" r="1.8" fill={color}/>
  </svg>
);

// L3 Switch: switch + routing arrows on top
const L3SwitchSVG = ({ color, size=36 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <rect x="3" y="17" width="34" height="11" rx="2" stroke={color} strokeWidth="2.2"/>
    {[6,10,14,18,22,26,30,34].map((x) => (
      <rect key={x} x={x} y="20" width="2.5" height="5" rx="0.5" stroke={color} strokeWidth="1.1"/>
    ))}
    {/* Bidirectional routing arrows */}
    <path d="M8 12 L16 12 M14 10 L16 12 L14 14" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <path d="M32 12 L24 12 M26 10 L24 12 L26 14" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <circle cx="20" cy="12" r="2.5" stroke={color} strokeWidth="1.6"/>
  </svg>
);

// Firewall: classic brick wall (Cisco style)
const FirewallSVG = ({ color, size=36 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <rect x="4" y="7"  width="32" height="7" rx="1.5" stroke={color} strokeWidth="1.8"/>
    <rect x="4" y="17" width="32" height="7" rx="1.5" stroke={color} strokeWidth="1.8"/>
    <rect x="4" y="27" width="32" height="7" rx="1.5" stroke={color} strokeWidth="1.8"/>
    <line x1="20" y1="7"  x2="20" y2="14" stroke={color} strokeWidth="1.6"/>
    <line x1="12" y1="17" x2="12" y2="24" stroke={color} strokeWidth="1.6"/>
    <line x1="28" y1="17" x2="28" y2="24" stroke={color} strokeWidth="1.6"/>
    <line x1="20" y1="27" x2="20" y2="34" stroke={color} strokeWidth="1.6"/>
  </svg>
);

// WAF: shield with globe/web
const WafSVG = ({ color, size=36 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <path d="M20 3 L34 8 L34 23 Q34 32 20 37 Q6 32 6 23 L6 8 Z" stroke={color} strokeWidth="2.2"/>
    <ellipse cx="20" cy="20" rx="8" ry="8" stroke={color} strokeWidth="1.5"/>
    <line x1="12" y1="20" x2="28" y2="20" stroke={color} strokeWidth="1.2" opacity="0.7"/>
    <line x1="20" y1="12" x2="20" y2="28" stroke={color} strokeWidth="1.2" opacity="0.7"/>
    <ellipse cx="20" cy="20" rx="3.5" ry="8" stroke={color} strokeWidth="1.2" opacity="0.6"/>
  </svg>
);

// AP: pole with wireless arcs (Cisco style)
const APSVG = ({ color, size=36 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <line x1="20" y1="16" x2="20" y2="38" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <line x1="14" y1="38" x2="26" y2="38" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <circle cx="20" cy="16" r="3" fill={color}/>
    <path d="M11 22 Q20 12 29 22" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none"/>
    <path d="M5  27 Q20 6  35 27" stroke={color} strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.55"/>
  </svg>
);

// WLC: controller box with wireless signal
const WlcSVG = ({ color, size=36 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <rect x="4" y="22" width="32" height="13" rx="2" stroke={color} strokeWidth="2.2"/>
    <line x1="10" y1="35" x2="10" y2="38" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    <line x1="30" y1="35" x2="30" y2="38" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    {[9,14,19,24,29].map((x) => (
      <circle key={x} cx={x} cy="29" r="1.5" fill={color} opacity={x===9||x===19?1:0.4}/>
    ))}
    <line x1="20" y1="22" x2="20" y2="16" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M13 19 Q20 11 27 19" stroke={color} strokeWidth="1.8" strokeLinecap="round" fill="none"/>
    <path d="M7  15 Q20 5  33 15" stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.55"/>
  </svg>
);

// Server: rack unit (Cisco style)
const ServerSVG = ({ color, size=36 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <rect x="4" y="5"  width="32" height="9"  rx="1.5" stroke={color} strokeWidth="2"/>
    <rect x="4" y="16" width="32" height="9"  rx="1.5" stroke={color} strokeWidth="2"/>
    <rect x="4" y="27" width="32" height="9"  rx="1.5" stroke={color} strokeWidth="2"/>
    <circle cx="32" cy="9.5"  r="2"   fill={color}/>
    <circle cx="32" cy="20.5" r="2"   fill={color}/>
    <circle cx="32" cy="31.5" r="2"   fill={color}/>
    <line x1="8" y1="9.5"  x2="24" y2="9.5"  stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity="0.45"/>
    <line x1="8" y1="20.5" x2="24" y2="20.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity="0.45"/>
    <line x1="8" y1="31.5" x2="24" y2="31.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity="0.45"/>
  </svg>
);

// Cloud: standard shape
const CloudSVG = ({ color, size=36 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <path d="M10 30 Q3 30 3 22 Q3 16 9 14 Q8 7 16 6 Q22 6 25 11 Q30 9 33 14 Q39 14 38 21 Q38 30 30 30 Z" stroke={color} strokeWidth="2.2"/>
  </svg>
);

// SD-WAN: globe with network connections
const SdWanSVG = ({ color, size=36 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <ellipse cx="20" cy="20" rx="14" ry="11" stroke={color} strokeWidth="2.2"/>
    <ellipse cx="20" cy="20" rx="6"  ry="11" stroke={color} strokeWidth="1.4" opacity="0.6"/>
    <line x1="6" y1="20" x2="34" y2="20" stroke={color} strokeWidth="1.4" opacity="0.6"/>
    <path d="M2 15 L6 20 L2 25"  stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <path d="M38 15 L34 20 L38 25" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <circle cx="20" cy="20" r="3" fill={color}/>
  </svg>
);

// Other: generic device
const OtherSVG = ({ color, size=36 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <rect x="4" y="4" width="32" height="32" rx="5" stroke={color} strokeWidth="2.2"/>
    <line x1="13" y1="14" x2="27" y2="14" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    <line x1="13" y1="20" x2="27" y2="20" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    <line x1="13" y1="26" x2="21" y2="26" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    <circle cx="29" cy="26" r="2.5" stroke={color} strokeWidth="1.6"/>
  </svg>
);

const DEVICE_ICONS  = { router: RouterSVG, switch: SwitchSVG, l3switch: L3SwitchSVG, firewall: FirewallSVG, waf: WafSVG, ap: APSVG, wlc: WlcSVG, server: ServerSVG, cloud: CloudSVG, sdwan: SdWanSVG, other: OtherSVG };
const DEVICE_COLORS = { router: "#4f7cff", switch: "#22c55e", l3switch: "#10b981", firewall: "#ef4444", waf: "#f43f5e", ap: "#f59e0b", wlc: "#fb923c", server: "#8b5cf6", cloud: "#6b7280", sdwan: "#06b6d4", other: "#94a3b8" };

/* ─── Port-selection modal ─── */
function PortSelectModal({ conn, onConfirm, onCancel }) {
  const [srcPort, setSrcPort] = useState(conn.preSrcPort || conn.srcPorts[0] || "");
  const [dstPort, setDstPort] = useState(conn.preDstPort || conn.dstPorts[0] || "");

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-surface border border-border rounded-xl p-5 w-80 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-white">Select Ports</span>
          <button onClick={onCancel} className="text-muted hover:text-white"><X size={14}/></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-muted block mb-1">
              {conn.srcLabel} — Source Port
            </label>
            <select value={srcPort} onChange={(e) => setSrcPort(e.target.value)}
              className="w-full bg-bg border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent">
              {conn.srcPorts.map((p) => <option key={p} value={p}>{p}</option>)}
              <option value="">— any —</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-muted block mb-1">
              {conn.dstLabel} — Target Port
            </label>
            <select value={dstPort} onChange={(e) => setDstPort(e.target.value)}
              className="w-full bg-bg border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent">
              {conn.dstPorts.map((p) => <option key={p} value={p}>{p}</option>)}
              <option value="">— any —</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={onCancel} className="flex-1 py-1.5 text-xs text-muted border border-border rounded-lg hover:text-white transition-colors">
            Cancel
          </button>
          <button onClick={() => onConfirm(srcPort, dstPort)}
            className="flex-1 py-1.5 text-xs bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors">
            Connect
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Custom node ─── */
function DiagramNode({ id, data, selected }) {
  const Icon    = DEVICE_ICONS[data.device_type]  || OtherSVG;
  const color   = DEVICE_COLORS[data.device_type] || "#94a3b8";
  const ports   = data.ports || DEFAULT_PORTS[data.device_type] || [];
  const scale   = data.scale || 1;
  const iconSz  = Math.round(32 * scale);

  // Split ports: >8 → top half on top edge, bottom half on bottom edge
  const topPorts = ports.length > 8 ? ports.slice(0, Math.ceil(ports.length / 2)) : [];
  const btmPorts = ports.length > 8 ? ports.slice(Math.ceil(ports.length / 2))    : ports;

  const hStyle = (i, total, side) => ({
    [side === "top" ? "top" : "bottom"]: -5,
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
      style={{
        border: `2px solid ${selected ? color : color + "50"}`,
        boxShadow: selected ? `0 0 14px ${color}55` : `0 0 6px ${color}18`,
        minWidth: Math.max(120, ports.length > 8 ? Math.ceil(ports.length / 2) * 14 : ports.length * 14),
      }}
      className="bg-[#13151f] rounded-xl px-3 pt-2.5 pb-3 cursor-pointer select-none transition-all"
    >
      {topPorts.map((p, i) => (
        <Handle key={p} type="source" position={Position.Top}    id={p} style={hStyle(i, topPorts.length, "top")} title={p}/>
      ))}
      {btmPorts.map((p, i) => (
        <Handle key={p} type="source" position={Position.Bottom} id={p} style={hStyle(i, btmPorts.length, "bottom")} title={p}/>
      ))}
      {["Top","Right","Bottom","Left"].map((s) => (
        <Handle key={s+"-t"} type="target" position={Position[s]} id={s.toLowerCase()+"-t"} style={{ opacity: 0, width: 8, height: 8 }}/>
      ))}

      <div className="flex flex-col items-center gap-1" style={{ transform: `scale(${scale})`, transformOrigin: "center top" }}>
        <Icon color={color} size={iconSz}/>
        <div className="text-[11px] font-mono text-white font-semibold text-center leading-tight" style={{ maxWidth: iconSz * 3.5 }}>{data.label || DEVICE_LABELS[data.device_type] || data.device_type}</div>
        {data.ip && <div className="text-[10px] font-mono text-muted">{data.ip}</div>}
        <div className="text-[9px] text-muted/40">{ports.length}p</div>
      </div>

      {/* Port dot indicators */}
      {topPorts.length > 0 && (
        <div className="flex justify-center gap-[3px] mt-1 pt-1 border-t border-white/5">
          {topPorts.map((p) => <div key={p} title={p} className="w-[5px] h-[5px] rounded-full" style={{ background: color + "70" }}/>)}
        </div>
      )}
      <div className="flex justify-center gap-[3px] mt-1 pb-0.5">
        {btmPorts.map((p) => <div key={p} title={p} className="w-[5px] h-[5px] rounded-full" style={{ background: color + "70" }}/>)}
      </div>
    </div>
  );
}

/* ─── Custom cable edge ─── */
function CableEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, style, selected }) {
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const ct = CABLE_TYPES[data?.cable_type] || CABLE_TYPES.ethernet;
  return (
    <>
      <path id={id} style={{ ...style, strokeWidth: selected ? 3 : 2, stroke: ct.color, strokeDasharray: ct.dash || undefined }}
        className="react-flow__edge-path" d={path} markerEnd={markerEnd}/>
      {(data?.src_port || data?.dst_port || data?.label) && (
        <EdgeLabelRenderer>
          <div style={{ position:"absolute", transform:`translate(-50%,-50%) translate(${lx}px,${ly}px)`, pointerEvents:"all" }}
            className="text-[9px] font-mono bg-[#13151f] border border-white/10 rounded px-1.5 py-0.5 whitespace-nowrap select-none"
            style={{ color: ct.color + "dd" }}>
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
  const [selectedId,   setSelectedId]   = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [pendingConn,  setPendingConn]  = useState(null);
  const [exporting,    setExporting]    = useState(false);
  const [saveState,    setSaveState]    = useState("saved");
  const { screenToFlowPosition, fitView } = useReactFlow();
  const flowRef  = useRef(null);
  const timerRef = useRef(null);

  const currentIdRef  = useRef(topoId);
  const nodesRef      = useRef([]);
  const edgesRef      = useRef([]);
  const nameRef       = useRef(topoName);
  const cableTypeRef  = useRef(activeCableType);
  const onSavedRef    = useRef(onSaved);
  useEffect(() => { currentIdRef.current = topoId;          }, [topoId]);
  useEffect(() => { nodesRef.current     = nodes;           }, [nodes]);
  useEffect(() => { edgesRef.current     = edges;           }, [edges]);
  useEffect(() => { nameRef.current      = topoName;        }, [topoName]);
  useEffect(() => { cableTypeRef.current = activeCableType; }, [activeCableType]);
  useEffect(() => { onSavedRef.current   = onSaved;         }, [onSaved]);

  /* load when topoId changes */
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
      setSelectedEdge(null);
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

  /* drag-drop */
  const onDragOver = useCallback((e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }, []);
  const onDrop     = useCallback((e) => {
    e.preventDefault();
    const deviceType = e.dataTransfer.getData("application/nms-device-type");
    if (!deviceType) return;
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setNodes((ns) => ns.concat({
      id: `n_${Date.now()}`,
      type: "diagram",
      position: pos,
      data: { device_type: deviceType, label: DEVICE_LABELS[deviceType]||deviceType, ip: "", notes: "", ports: [...(DEFAULT_PORTS[deviceType]||[])], scale: 1, onSelect: setSelectedId },
    }));
    triggerSave();
  }, [screenToFlowPosition, triggerSave]);

  /* connection → open port-select modal */
  const onConnect = useCallback((params) => {
    const src = nodesRef.current.find((n) => n.id === params.source);
    const dst = nodesRef.current.find((n) => n.id === params.target);
    if (!src || !dst) return;
    const preSrc = params.sourceHandle && !params.sourceHandle.endsWith("-t") ? params.sourceHandle : null;
    const preDst = params.targetHandle && !params.targetHandle.endsWith("-t") ? params.targetHandle : null;
    setPendingConn({
      params,
      srcPorts:  src.data.ports || [],
      dstPorts:  dst.data.ports || [],
      preSrcPort: preSrc,
      preDstPort: preDst,
      srcLabel:  src.data.label || src.data.device_type,
      dstLabel:  dst.data.label || dst.data.device_type,
    });
  }, []);

  const confirmConn = useCallback((srcPort, dstPort) => {
    if (!pendingConn) return;
    setEdges((es) => es.concat({
      id: `e_${Date.now()}`,
      source: pendingConn.params.source,
      target: pendingConn.params.target,
      type: "cable",
      data: { cable_type: cableTypeRef.current, src_port: srcPort || null, dst_port: dstPort || null, label: "" },
    }));
    setPendingConn(null);
    triggerSave();
  }, [pendingConn, triggerSave]);

  /* edge click → show edge panel */
  const onEdgeClick = useCallback((_, edge) => {
    setSelectedEdge(edge);
    setSelectedId(null);
  }, []);

  const deleteEdge = useCallback((edgeId) => {
    setEdges((es) => es.filter((e) => e.id !== edgeId));
    setSelectedEdge(null);
    triggerSave();
  }, [triggerSave]);

  const updateEdgeLabel = useCallback((edgeId, label) => {
    setEdges((es) => es.map((e) => e.id === edgeId ? { ...e, data: { ...e.data, label } } : e));
    triggerSave();
  }, [triggerSave]);

  /* node update */
  const updateNode = useCallback((id, patch) => {
    setNodes((ns) => ns.map((n) => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n));
    triggerSave();
  }, [triggerSave]);

  const deleteNode = useCallback((id) => {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    setSelectedId(null);
    triggerSave();
  }, [triggerSave]);

  /* PDF export */
  const exportPDF = async () => {
    if (!flowRef.current) return;
    setExporting(true);
    toast.loading("Generating PDF…", { id: "pdf" });
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
      fitView({ padding: 0.1, duration: 0 });
      await new Promise((r) => setTimeout(r, 200));
      const canvas = await html2canvas(flowRef.current, { backgroundColor: "#0e1018", scale: 2, useCORS: true, logging: false });
      const pdf = new jsPDF({ orientation: canvas.width > canvas.height ? "landscape" : "portrait", unit: "mm", format: "a4" });
      const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
      const ratio = Math.min(pw / canvas.width, ph / canvas.height);
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", (pw - canvas.width*ratio)/2, (ph - canvas.height*ratio)/2, canvas.width*ratio, canvas.height*ratio);
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
    if (!confirm(`Delete "${topoName}"?`)) return;
    await topologiesAPI.delete(currentIdRef.current);
    toast.success("Deleted");
    onDeleted();
  };

  const selectedNode = nodes.find((n) => n.id === selectedId);
  const saveLabel = { saved: <span className="text-[10px] text-green-400">✓ saved</span>, saving: <span className="text-[10px] text-amber-400 animate-pulse">saving…</span>, unsaved: <span className="text-[10px] text-amber-400">● unsaved</span> }[saveState];

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <input value={topoName} onChange={(e) => { onNameChange(e.target.value); triggerSave(); }}
          className="bg-transparent border-b border-border text-white text-sm font-semibold px-1 py-0.5 focus:outline-none focus:border-accent w-44" placeholder="Topology name…"/>
        {saveLabel}
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
      </div>

      <div className="flex flex-1 gap-3 min-h-0">
        {/* Canvas */}
        <div ref={flowRef} className="flex-1 bg-[#0e1018] border border-border rounded-xl overflow-hidden" style={{minHeight:0}}>
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={(c) => { onNodesChange(c); if (c.some((x) => x.type==="remove")) triggerSave(); }}
            onEdgesChange={(c) => { onEdgesChange(c); if (c.some((x) => x.type==="remove")) triggerSave(); }}
            onNodeDragStop={() => triggerSave()}
            onConnect={onConnect}
            onEdgeClick={onEdgeClick}
            onPaneClick={() => { setSelectedId(null); setSelectedEdge(null); }}
            onDrop={onDrop} onDragOver={onDragOver}
            nodeTypes={nodeTypes} edgeTypes={edgeTypes}
            connectionMode="loose" fitView deleteKeyCode="Delete"
          >
            <Background color="#1a1d2e" gap={24} size={1}/>
            <Controls className="!bg-surface !border-border"/>
            <MiniMap nodeColor={(n) => DEVICE_COLORS[n.data?.device_type]||"#94a3b8"} className="!bg-surface !border-border" maskColor="#0e1018cc"/>
          </ReactFlow>
        </div>

        {/* Node properties panel */}
        {selectedNode && (
          <div className="w-56 bg-surface border border-border rounded-xl p-3 flex flex-col gap-2.5 shrink-0 overflow-y-auto">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white">Properties</span>
              <button onClick={() => setSelectedId(null)} className="text-muted hover:text-white"><X size={13}/></button>
            </div>
            <div>
              <label className="text-[10px] text-muted mb-1 block">Type</label>
              <select value={selectedNode.data.device_type}
                onChange={(e) => updateNode(selectedNode.id, { device_type: e.target.value, ports: [...(DEFAULT_PORTS[e.target.value]||[])] })}
                className="w-full bg-bg border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent">
                {DEVICE_TYPES.map((t) => <option key={t} value={t}>{DEVICE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted mb-1 block">Label</label>
              <input value={selectedNode.data.label||""} onChange={(e) => updateNode(selectedNode.id, { label: e.target.value })}
                className="w-full bg-bg border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent" placeholder="Device name…"/>
            </div>
            <div>
              <label className="text-[10px] text-muted mb-1 block">IP Address</label>
              <input value={selectedNode.data.ip||""} onChange={(e) => updateNode(selectedNode.id, { ip: e.target.value })}
                className="w-full bg-bg border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent" placeholder="192.168.1.1"/>
            </div>
            {/* Icon size */}
            <div>
              <label className="text-[10px] text-muted mb-1 block">Icon Size</label>
              <div className="flex items-center gap-2">
                <button onClick={() => updateNode(selectedNode.id, { scale: Math.max(0.5, (selectedNode.data.scale||1) - 0.1) })}
                  className="p-1 bg-white/5 hover:bg-white/10 rounded border border-border text-muted hover:text-white transition-colors">
                  <ZoomOut size={12}/>
                </button>
                <span className="text-xs text-white font-mono flex-1 text-center">{Math.round((selectedNode.data.scale||1)*100)}%</span>
                <button onClick={() => updateNode(selectedNode.id, { scale: Math.min(2.0, (selectedNode.data.scale||1) + 0.1) })}
                  className="p-1 bg-white/5 hover:bg-white/10 rounded border border-border text-muted hover:text-white transition-colors">
                  <ZoomIn size={12}/>
                </button>
              </div>
            </div>
            {/* Ports */}
            <div>
              <label className="text-[10px] text-muted mb-1 block">Ports (one per line)</label>
              <textarea value={(selectedNode.data.ports||[]).join("\n")}
                onChange={(e) => updateNode(selectedNode.id, { ports: e.target.value.split("\n").map((s)=>s.trim()).filter(Boolean) })}
                rows={Math.min((selectedNode.data.ports||[]).length + 1, 8)}
                className="w-full bg-bg border border-border rounded-lg px-2 py-1.5 text-[10px] font-mono text-white focus:outline-none focus:border-accent resize-y"/>
            </div>
            <div>
              <label className="text-[10px] text-muted mb-1 block">Notes</label>
              <textarea value={selectedNode.data.notes||""} onChange={(e) => updateNode(selectedNode.id, { notes: e.target.value })}
                rows={2} className="w-full bg-bg border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent resize-none" placeholder="Optional…"/>
            </div>
            <button onClick={() => deleteNode(selectedNode.id)}
              className="mt-auto flex items-center justify-center gap-1.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs rounded-lg transition-colors">
              <Trash2 size={11}/> Delete Node
            </button>
          </div>
        )}

        {/* Edge panel */}
        {selectedEdge && !selectedNode && (
          <div className="w-52 bg-surface border border-border rounded-xl p-3 flex flex-col gap-2.5 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white">Cable</span>
              <button onClick={() => setSelectedEdge(null)} className="text-muted hover:text-white"><X size={13}/></button>
            </div>
            {/* Cable type info */}
            {(() => {
              const ct = CABLE_TYPES[selectedEdge.data?.cable_type] || CABLE_TYPES.ethernet;
              return (
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: ct.color }}/>
                  <span className="text-xs text-white">{ct.label}</span>
                </div>
              );
            })()}
            {/* Port info */}
            {(selectedEdge.data?.src_port || selectedEdge.data?.dst_port) && (
              <div className="text-[10px] font-mono text-muted bg-white/5 rounded px-2 py-1.5">
                {[selectedEdge.data.src_port, selectedEdge.data.dst_port].filter(Boolean).join(" ↔ ")}
              </div>
            )}
            {/* Label edit */}
            <div>
              <label className="text-[10px] text-muted mb-1 block">Label</label>
              <input defaultValue={selectedEdge.data?.label||""}
                onBlur={(e) => updateEdgeLabel(selectedEdge.id, e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent" placeholder="Optional label…"/>
            </div>
            <button onClick={() => deleteEdge(selectedEdge.id)}
              className="mt-auto flex items-center justify-center gap-1.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs rounded-lg transition-colors">
              <Trash2 size={11}/> Delete Cable
            </button>
          </div>
        )}
      </div>

      {/* Port-select modal */}
      {pendingConn && (
        <PortSelectModal conn={pendingConn} onConfirm={confirmConn} onCancel={() => setPendingConn(null)}/>
      )}
    </div>
  );
}

/* ─── Cable type bar + canvas wrapper ─── */
function TopologyInnerWithCableType(props) {
  const [cableType, setCableType] = useState("ethernet");
  return (
    <div className="flex flex-col h-full gap-1.5">
      <div className="flex items-center gap-1 flex-wrap shrink-0">
        <span className="text-[10px] text-muted mr-1">Cable:</span>
        {Object.entries(CABLE_TYPES).map(([key, ct]) => (
          <button key={key} onClick={() => setCableType(key)}
            style={{ borderColor: cableType===key ? ct.color : "transparent", color: cableType===key ? ct.color : undefined }}
            className={`px-2 py-0.5 text-[10px] rounded border transition-colors flex items-center gap-1 ${cableType===key?"bg-white/5":"text-muted hover:text-white"}`}>
            <span className="inline-block w-3 h-0.5 rounded" style={{
              background: ct.dash ? "none" : ct.color,
              backgroundImage: ct.dash ? `repeating-linear-gradient(90deg,${ct.color} 0,${ct.color} 4px,transparent 4px,transparent 8px)` : undefined,
            }}/>
            {ct.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        <TopologyCanvas {...props} activeCableType={cableType}/>
      </div>
    </div>
  );
}

/* ─── Main page ─── */
export default function Topology() {
  const [topologies, setTopologies] = useState([]);
  const [activeId,   setActiveId]   = useState(null);
  const [activeName, setActiveName] = useState("New Topology");
  const [hasCanvas,  setHasCanvas]  = useState(false);

  const loadList = useCallback(() => topologiesAPI.list().then((r) => setTopologies(r.data)), []);
  useEffect(() => { loadList(); }, []);

  const openTopology = (t) => { setActiveId(t.id); setActiveName(t.name); setHasCanvas(true); };
  const newTopology  = ()  => { setActiveId(null); setActiveName("New Topology"); setHasCanvas(true); };
  const onSaved   = useCallback((id, name) => { setActiveId(id); setActiveName(name); loadList(); }, [loadList]);
  const onDeleted = useCallback(() => { setActiveId(null); setHasCanvas(false); loadList(); }, [loadList]);

  return (
    <Layout title="Topology">
      <div className="flex gap-3 h-[calc(100vh-8rem)]">
        {/* ── Sidebar ── */}
        <div className="w-44 shrink-0 flex flex-col gap-3">
          <button onClick={newTopology}
            className="flex items-center justify-center gap-1.5 py-2 bg-accent/10 hover:bg-accent/20 text-accent text-xs rounded-lg border border-accent/20 transition-colors">
            <Plus size={13}/> New Topology
          </button>

          {/* Saved list */}
          <div style={{maxHeight:"25%", overflowY:"auto"}} className="min-h-0">
            <div className="text-[10px] text-muted uppercase tracking-wider mb-1.5 px-0.5">Saved</div>
            {topologies.length === 0 && <div className="text-[11px] text-muted/60 px-0.5">No topologies yet</div>}
            {topologies.map((t) => (
              <button key={t.id} onClick={() => openTopology(t)}
                className={`w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors mb-0.5 flex items-start gap-1.5
                  ${activeId===t.id?"bg-accent/15 text-white":"text-muted hover:text-white hover:bg-white/5"}`}>
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
            <div className="text-[9px] text-muted/40 px-0.5 mb-1.5">drag onto canvas</div>
            <div className="grid grid-cols-2 gap-1">
              {DEVICE_TYPES.map((type) => {
                const Icon  = DEVICE_ICONS[type];
                const color = DEVICE_COLORS[type];
                return (
                  <div key={type} draggable
                    onDragStart={(e) => { e.dataTransfer.setData("application/nms-device-type", type); e.dataTransfer.effectAllowed = "move"; }}
                    className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg border border-border cursor-grab hover:border-accent/40 hover:bg-white/5 transition-all select-none active:cursor-grabbing"
                    title={DEVICE_LABELS[type]}>
                    <Icon color={color} size={22}/>
                    <span className="text-[9px] text-muted text-center leading-tight">{DEVICE_LABELS[type]}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cable legend */}
          <div className="shrink-0 mt-1">
            <div className="text-[10px] text-muted uppercase tracking-wider mb-1.5 px-0.5">Cable Types</div>
            <div className="flex flex-col gap-1 px-0.5">
              {Object.entries(CABLE_TYPES).map(([key, ct]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="w-6 h-[2px] shrink-0" style={{
                    background: ct.dash ? "none" : ct.color,
                    backgroundImage: ct.dash ? `repeating-linear-gradient(90deg,${ct.color} 0,${ct.color} 4px,transparent 4px,transparent 8px)` : undefined,
                    display:"block",
                  }}/>
                  <span className="text-[10px] text-muted">{ct.label}</span>
                </div>
              ))}
            </div>
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
