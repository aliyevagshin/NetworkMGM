import { useEffect, useState, useCallback } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
} from "reactflow";
import "reactflow/dist/style.css";
import Layout from "../components/Layout";
import { devicesAPI } from "../api";
import { useNavigate } from "react-router-dom";

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

const nodeTypes = { device: DeviceNode };

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
      nodes.push({
        id: String(d.id),
        type: "device",
        position: { x: i * 200, y },
        data: { ...d },
      });
    });
    if (group.length > 0) y += 160;
  }
  return nodes;
}

export default function Topology() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selected, setSelected] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    devicesAPI.list().then((r) => {
      const devices = r.data;
      const ns = positionNodes(devices).map((n) => ({
        ...n,
        data: {
          ...n.data,
          onOpen: () => setSelected(devices.find((d) => d.id === parseInt(n.id))),
        },
      }));
      setNodes(ns);

      // Create edges: connect routers → switches, switches → servers/APs
      const routers = devices.filter((d) => d.device_type === "router");
      const switches = devices.filter((d) => d.device_type === "switch");
      const endpoints = devices.filter((d) => ["server", "ap"].includes(d.device_type));
      const es = [];
      routers.forEach((r, i) => {
        switches.slice(0, 2).forEach((s) => {
          es.push({ id: `r-${r.id}-s-${s.id}`, source: String(r.id), target: String(s.id), animated: r.status === "online" });
        });
      });
      switches.forEach((s) => {
        endpoints.slice(0, 3).forEach((e) => {
          es.push({ id: `s-${s.id}-e-${e.id}`, source: String(s.id), target: String(e.id) });
        });
      });
      setEdges(es);
    });
  }, []);

  return (
    <Layout title="Topology">
      <div className="relative h-[calc(100vh-9rem)] bg-surface border border-border rounded-xl overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background color="#2a2d3e" gap={20} />
          <Controls className="bg-surface border border-border" />
          <MiniMap
            nodeColor={(n) => statusColors[n.data?.status] || statusColors.unknown}
            className="bg-surface border border-border"
          />
        </ReactFlow>

        {selected && (
          <div className="absolute top-4 right-4 bg-surface border border-border rounded-xl p-4 w-64 shadow-xl">
            <div className="flex justify-between items-start mb-3">
              <div className="font-mono font-semibold text-white">{selected.hostname}</div>
              <button onClick={() => setSelected(null)} className="text-muted hover:text-white">✕</button>
            </div>
            <div className="space-y-1.5 text-xs">
              {[["IP", selected.ip_address], ["Type", selected.device_type], ["Vendor", selected.vendor], ["Location", selected.location || "—"], ["Status", selected.status]].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-muted">{k}</span>
                  <span className="text-white font-mono">{v}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => navigate("/ssh")}
              className="mt-3 w-full py-1.5 bg-accent hover:bg-accent/90 text-white text-xs rounded-lg transition-colors">
              Open SSH Console
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
