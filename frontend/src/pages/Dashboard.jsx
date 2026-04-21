import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import StatusBadge from "../components/StatusBadge";
import { devicesAPI, alertsAPI, monitoringAPI } from "../api";
import { Server, Wifi, AlertTriangle, Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

function StatCard({ icon: Icon, label, value, sub, color = "accent" }) {
  const colors = { accent: "text-accent", green: "text-green-400", amber: "text-amber-400", red: "text-red-400" };
  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted mb-1">{label}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
          {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
        </div>
        <div className={`p-2 rounded-lg bg-white/5 ${colors[color]}`}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [devices, setDevices] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([devicesAPI.list(), alertsAPI.list()]).then(([d, a]) => {
      setDevices(d.data);
      setAlerts(a.data);
    }).finally(() => setLoading(false));
  }, []);

  const online = devices.filter((d) => d.status === "online").length;
  const offline = devices.filter((d) => d.status === "offline").length;
  const critical = alerts.filter((a) => a.severity === "critical").length;

  return (
    <Layout title="Dashboard">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Server} label="Total Devices" value={devices.length} color="accent" />
        <StatCard icon={Wifi} label="Online" value={online} sub={`${devices.length ? Math.round((online / devices.length) * 100) : 0}% uptime`} color="green" />
        <StatCard icon={Activity} label="Offline" value={offline} color="red" />
        <StatCard icon={AlertTriangle} label="Active Alerts" value={alerts.length} sub={`${critical} critical`} color="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface border border-border rounded-xl">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-white text-sm">Recent Devices</h2>
          </div>
          <div className="divide-y divide-border">
            {loading ? (
              <div className="p-5 text-muted text-sm">Loading...</div>
            ) : devices.slice(0, 8).map((d) => (
              <div key={d.id} className="px-5 py-3 flex items-center justify-between hover:bg-white/2 transition-colors">
                <div>
                  <div className="text-sm text-white font-mono">{d.hostname}</div>
                  <div className="text-xs text-muted font-mono">{d.ip_address}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted">{d.device_type}</span>
                  <StatusBadge status={d.status} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-white text-sm">Active Alerts</h2>
          </div>
          <div className="divide-y divide-border">
            {loading ? (
              <div className="p-5 text-muted text-sm">Loading...</div>
            ) : alerts.slice(0, 8).map((a) => (
              <div key={a.id} className="px-5 py-3 hover:bg-white/2 transition-colors">
                <div className="flex items-center gap-2 mb-0.5">
                  <StatusBadge status={a.severity} />
                  <span className="text-xs text-muted font-mono">{a.event_type}</span>
                </div>
                <div className="text-sm text-white">{a.message}</div>
                <div className="text-xs text-muted mt-0.5">
                  {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                </div>
              </div>
            ))}
            {!loading && alerts.length === 0 && (
              <div className="p-5 text-muted text-sm">No active alerts</div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
