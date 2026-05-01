import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Plus, Trash2, TestTube, CheckCircle, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import Layout from "../components/Layout";
import { notificationsAPI, devicesAPI } from "../api";
import toast from "react-hot-toast";

// ── Constants ─────────────────────────────────────────────────────────────────
const CHANNEL_TYPES = [
  { value: "email",   label: "Email (SMTP)" },
  { value: "teams",   label: "Microsoft Teams" },
  { value: "slack",   label: "Slack" },
  { value: "webhook", label: "Generic Webhook" },
];

const EVENT_TYPES = [
  { value: "device_down",        label: "Device Down",         needsThreshold: false },
  { value: "device_up",          label: "Device Up",           needsThreshold: false },
  { value: "cpu_high",           label: "CPU High",            needsThreshold: true, unit: "%" },
  { value: "memory_high",        label: "Memory High",         needsThreshold: true, unit: "%" },
  { value: "packet_loss_high",   label: "Packet Loss High",    needsThreshold: true, unit: "%" },
  { value: "traffic_threshold",  label: "NetFlow Traffic High", needsThreshold: true, unit: "bytes/min" },
];

const EVENT_LABEL = Object.fromEntries(EVENT_TYPES.map((e) => [e.value, e.label]));

// ── Helpers ───────────────────────────────────────────────────────────────────
function Badge({ ok }) {
  return ok ? (
    <span className="flex items-center gap-1 text-xs text-green-400">
      <CheckCircle size={12} /> Enabled
    </span>
  ) : (
    <span className="flex items-center gap-1 text-xs text-muted">
      <XCircle size={12} /> Disabled
    </span>
  );
}

function SectionHeader({ title, count, onAdd, open, onToggle }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-sm font-medium text-white hover:text-accent transition-colors"
      >
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {title}
        <span className="text-xs text-muted font-normal">({count})</span>
      </button>
      <button
        onClick={onAdd}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-accent/10 text-accent border border-accent/20 rounded-lg hover:bg-accent/20 transition-colors"
      >
        <Plus size={12} /> Add
      </button>
    </div>
  );
}

// ── Channel Form ──────────────────────────────────────────────────────────────
function ChannelForm({ onSave, onCancel }) {
  const [type, setType] = useState("teams");
  const [name, setName] = useState("");
  const [cfg, setCfg] = useState({});

  function updateCfg(k, v) {
    setCfg((prev) => ({ ...prev, [k]: v }));
  }

  function renderConfigFields() {
    if (type === "email") return (
      <div className="grid grid-cols-2 gap-3">
        <Field label="SMTP Host" value={cfg.smtp_host || ""} onChange={(v) => updateCfg("smtp_host", v)} placeholder="smtp.example.com" />
        <Field label="SMTP Port" value={cfg.smtp_port || ""} onChange={(v) => updateCfg("smtp_port", v)} placeholder="587" />
        <Field label="SMTP User" value={cfg.smtp_user || ""} onChange={(v) => updateCfg("smtp_user", v)} placeholder="user@example.com" />
        <Field label="SMTP Password" value={cfg.smtp_pass || ""} onChange={(v) => updateCfg("smtp_pass", v)} placeholder="••••••••" type="password" />
        <Field label="From Address" value={cfg.from_addr || ""} onChange={(v) => updateCfg("from_addr", v)} placeholder="nms@example.com" />
        <Field label="To Addresses" value={cfg.to_addrs || ""} onChange={(v) => updateCfg("to_addrs", v)} placeholder="ops@example.com,noc@example.com" />
      </div>
    );
    if (type === "teams" || type === "slack" || type === "webhook") return (
      <Field label="Webhook URL" value={cfg.webhook_url || ""} onChange={(v) => updateCfg("webhook_url", v)} placeholder="https://..." full />
    );
    return null;
  }

  return (
    <div className="p-4 border-b border-border bg-white/[0.02] space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted block mb-1">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent/50"
            placeholder="My Teams Channel"
          />
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => { setType(e.target.value); setCfg({}); }}
            className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none"
          >
            {CHANNEL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>
      {renderConfigFields()}
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-muted hover:text-white border border-border rounded-lg transition-colors">
          Cancel
        </button>
        <button
          onClick={() => onSave({ name, channel_type: type, config: cfg })}
          disabled={!name}
          className="px-3 py-1.5 text-sm bg-accent text-white rounded-lg disabled:opacity-40 hover:bg-accent/90 transition-colors"
        >
          Save Channel
        </button>
      </div>
    </div>
  );
}

// ── Trigger Form ──────────────────────────────────────────────────────────────
function TriggerForm({ channels, devices, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: "", event_type: "device_down", device_id: "",
    threshold: "", channel_id: "", cooldown_minutes: 30,
  });

  const eventInfo = EVENT_TYPES.find((e) => e.value === form.event_type);

  function update(k, v) { setForm((p) => ({ ...p, [k]: v })); }

  return (
    <div className="p-4 border-b border-border bg-white/[0.02] space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Trigger Name" value={form.name} onChange={(v) => update("name", v)} placeholder="Router Down Alert" full />
        <div>
          <label className="text-xs text-muted block mb-1">Event Type</label>
          <select value={form.event_type} onChange={(e) => update("event_type", e.target.value)}
            className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none">
            {EVENT_TYPES.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Device (optional — blank = all)</label>
          <select value={form.device_id} onChange={(e) => update("device_id", e.target.value)}
            className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none">
            <option value="">All devices</option>
            {devices.map((d) => <option key={d.id} value={d.id}>{d.hostname}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Notification Channel</label>
          <select value={form.channel_id} onChange={(e) => update("channel_id", e.target.value)}
            className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none">
            <option value="">Select channel…</option>
            {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {eventInfo?.needsThreshold && (
          <Field
            label={`Threshold (${eventInfo.unit})`}
            value={form.threshold}
            onChange={(v) => update("threshold", v)}
            placeholder={eventInfo.unit === "%" ? "80" : "10000000"}
            type="number"
          />
        )}
        <Field label="Cooldown (min)" value={form.cooldown_minutes} onChange={(v) => update("cooldown_minutes", v)} type="number" placeholder="30" />
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-muted hover:text-white border border-border rounded-lg transition-colors">
          Cancel
        </button>
        <button
          onClick={() => onSave({
            ...form,
            device_id: form.device_id ? Number(form.device_id) : null,
            channel_id: Number(form.channel_id),
            threshold: form.threshold ? Number(form.threshold) : null,
            cooldown_minutes: Number(form.cooldown_minutes),
          })}
          disabled={!form.name || !form.channel_id}
          className="px-3 py-1.5 text-sm bg-accent text-white rounded-lg disabled:opacity-40 hover:bg-accent/90 transition-colors"
        >
          Save Trigger
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", full }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <label className="text-xs text-muted block mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent/50"
      />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Notifications() {
  const qc = useQueryClient();
  const [showChannelForm, setShowChannelForm] = useState(false);
  const [showTriggerForm, setShowTriggerForm] = useState(false);
  const [channelsOpen, setChannelsOpen] = useState(true);
  const [triggersOpen, setTriggersOpen] = useState(true);

  const { data: channels = [] } = useQuery({
    queryKey: ["notif-channels"],
    queryFn: () => notificationsAPI.channels().then((r) => r.data),
  });

  const { data: triggers = [] } = useQuery({
    queryKey: ["notif-triggers"],
    queryFn: () => notificationsAPI.triggers().then((r) => r.data),
  });

  const { data: devices = [] } = useQuery({
    queryKey: ["devices"],
    queryFn: () => devicesAPI.list().then((r) => r.data),
  });

  const createChannel = useMutation({
    mutationFn: (data) => notificationsAPI.createChannel(data),
    onSuccess: () => { qc.invalidateQueries(["notif-channels"]); setShowChannelForm(false); toast.success("Channel created"); },
    onError: () => toast.error("Failed to create channel"),
  });

  const deleteChannel = useMutation({
    mutationFn: (id) => notificationsAPI.deleteChannel(id),
    onSuccess: () => { qc.invalidateQueries(["notif-channels"]); toast.success("Channel deleted"); },
  });

  const testChannel = useMutation({
    mutationFn: (id) => notificationsAPI.testChannel(id),
    onSuccess: () => toast.success("Test notification sent!"),
    onError: (e) => toast.error(e?.response?.data?.detail || "Test failed — check logs"),
  });

  const createTrigger = useMutation({
    mutationFn: (data) => notificationsAPI.createTrigger(data),
    onSuccess: () => { qc.invalidateQueries(["notif-triggers"]); setShowTriggerForm(false); toast.success("Trigger created"); },
    onError: (e) => toast.error(e?.response?.data?.detail || "Failed to create trigger"),
  });

  const deleteTrigger = useMutation({
    mutationFn: (id) => notificationsAPI.deleteTrigger(id),
    onSuccess: () => { qc.invalidateQueries(["notif-triggers"]); toast.success("Trigger deleted"); },
  });

  const toggleTrigger = useMutation({
    mutationFn: ({ id, enabled }) => notificationsAPI.updateTrigger(id, { enabled }),
    onSuccess: () => qc.invalidateQueries(["notif-triggers"]),
  });

  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Bell size={18} className="text-accent" />
          <div>
            <h1 className="text-xl font-semibold text-white leading-tight">Notifications</h1>
            <p className="text-xs text-muted">Channels and alert triggers for device/traffic events</p>
          </div>
        </div>

        {/* Channels */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <SectionHeader
            title="Notification Channels"
            count={channels.length}
            onAdd={() => setShowChannelForm(true)}
            open={channelsOpen}
            onToggle={() => setChannelsOpen((o) => !o)}
          />
          {showChannelForm && (
            <ChannelForm
              onSave={(data) => createChannel.mutate(data)}
              onCancel={() => setShowChannelForm(false)}
            />
          )}
          {channelsOpen && (
            channels.length === 0 && !showChannelForm ? (
              <div className="px-4 py-8 text-center text-muted text-sm">
                No channels yet — add one to start receiving alerts.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {channels.map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-4 py-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white font-medium">{c.name}</span>
                        <span className="text-xs px-2 py-0.5 bg-white/5 text-muted rounded-full">
                          {CHANNEL_TYPES.find((t) => t.value === c.channel_type)?.label ?? c.channel_type}
                        </span>
                      </div>
                      {c.config?.webhook_url && (
                        <div className="text-xs text-muted font-mono truncate max-w-[400px]">
                          {c.config.webhook_url}
                        </div>
                      )}
                      {c.config?.smtp_host && (
                        <div className="text-xs text-muted">
                          {c.config.smtp_host}:{c.config.smtp_port} → {c.config.to_addrs}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge ok={c.enabled} />
                      <button
                        onClick={() => testChannel.mutate(c.id)}
                        title="Send test notification"
                        className="p-1.5 text-muted hover:text-accent rounded-lg hover:bg-accent/10 transition-colors"
                      >
                        <TestTube size={14} />
                      </button>
                      <button
                        onClick={() => { if (window.confirm(`Delete "${c.name}"?`)) deleteChannel.mutate(c.id); }}
                        className="p-1.5 text-muted hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Triggers */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <SectionHeader
            title="Alert Triggers"
            count={triggers.length}
            onAdd={() => setShowTriggerForm(true)}
            open={triggersOpen}
            onToggle={() => setTriggersOpen((o) => !o)}
          />
          {showTriggerForm && (
            <TriggerForm
              channels={channels}
              devices={devices}
              onSave={(data) => createTrigger.mutate(data)}
              onCancel={() => setShowTriggerForm(false)}
            />
          )}
          {triggersOpen && (
            triggers.length === 0 && !showTriggerForm ? (
              <div className="px-4 py-8 text-center text-muted text-sm">
                No triggers yet — add a channel first, then create a trigger.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {triggers.map((t) => (
                  <div key={t.id} className="flex items-center justify-between px-4 py-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-white font-medium">{t.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                          {EVENT_LABEL[t.event_type] ?? t.event_type}
                        </span>
                        {t.threshold != null && (
                          <span className="text-xs text-muted">≥ {t.threshold}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted">
                        {t.device_name ? `Device: ${t.device_name}` : "All devices"}
                        {" · "}Channel: {t.channel_name ?? "—"}
                        {" · "}Cooldown: {t.cooldown_minutes} min
                        {t.last_fired && ` · Last fired: ${new Date(t.last_fired).toLocaleString()}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleTrigger.mutate({ id: t.id, enabled: !t.enabled })}
                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                          t.enabled
                            ? "border-green-500/30 text-green-400 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30"
                            : "border-border text-muted hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/30"
                        }`}
                      >
                        {t.enabled ? "Enabled" : "Disabled"}
                      </button>
                      <button
                        onClick={() => { if (window.confirm(`Delete "${t.name}"?`)) deleteTrigger.mutate(t.id); }}
                        className="p-1.5 text-muted hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* How-to note */}
        <div className="rounded-xl border border-border bg-surface p-4 text-xs text-muted space-y-1">
          <p className="font-medium text-white text-sm mb-2">How triggers work</p>
          <p>1. Create a <span className="text-white">Notification Channel</span> (Teams webhook, Slack, email, or any HTTP endpoint).</p>
          <p>2. Create a <span className="text-white">Trigger</span> — pick an event type, optionally target a specific device, and assign a channel.</p>
          <p>3. When the event fires (e.g. device goes offline), NMS sends a notification and respects the <span className="text-white">cooldown</span> to avoid spam.</p>
          <p>4. <span className="text-white">traffic_threshold</span> triggers check the bytes-per-minute generated by the NetFlow simulator/collector.</p>
        </div>
      </div>
    </Layout>
  );
}
