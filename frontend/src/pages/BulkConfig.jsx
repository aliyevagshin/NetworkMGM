import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Layout from "../components/Layout";
import { devicesAPI, bulkConfigAPI } from "../api";
import {
  Play, Trash2, ChevronDown, ChevronUp, CheckSquare, Square,
  Search, Clock, CheckCircle, XCircle, Loader2, Terminal,
} from "lucide-react";
import toast from "react-hot-toast";

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    pending:  { color: "text-muted bg-white/5",           icon: Clock,      label: "Pending" },
    running:  { color: "text-blue-400 bg-blue-500/10",    icon: Loader2,    label: "Running" },
    success:  { color: "text-green-400 bg-green-500/10",  icon: CheckCircle,label: "Success" },
    error:    { color: "text-red-400 bg-red-500/10",      icon: XCircle,    label: "Error" },
    done:     { color: "text-green-400 bg-green-500/10",  icon: CheckCircle,label: "Done" },
  };
  const cfg = map[status] || map.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${cfg.color}`}>
      <Icon size={11} className={status === "running" ? "animate-spin" : ""} />
      {cfg.label}
    </span>
  );
}

// ── Single device result row ──────────────────────────────────────────────────
function ResultRow({ result }) {
  const [open, setOpen] = useState(false);
  const hasContent = result.output || result.error;
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors text-left"
        onClick={() => hasContent && setOpen((v) => !v)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <StatusBadge status={result.status} />
          <span className="text-sm font-medium text-white truncate">{result.device_hostname}</span>
          <span className="text-xs text-muted">{result.device_ip}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          {result.finished_at && result.started_at && (
            <span className="text-xs text-muted">
              {(
                (new Date(result.finished_at) - new Date(result.started_at)) / 1000
              ).toFixed(1)}s
            </span>
          )}
          {hasContent && (open ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />)}
        </div>
      </button>
      {open && hasContent && (
        <div className="border-t border-border bg-[#0a0c12] p-4">
          <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-all leading-relaxed">
            {result.output || ""}
            {result.error ? `\n[ERROR] ${result.error}` : ""}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Job history card ──────────────────────────────────────────────────────────
function JobCard({ job, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const success = job.results.filter((r) => r.status === "success").length;
  const errors  = job.results.filter((r) => r.status === "error").length;
  const total   = job.results.length;

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <StatusBadge status={job.status} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {job.label || `Job #${job.id}`}
            </p>
            <p className="text-xs text-muted">
              {new Date(job.created_at).toLocaleString()} · {total} device{total !== 1 ? "s" : ""} ·{" "}
              <span className="text-green-400">{success} ok</span>
              {errors > 0 && <span className="text-red-400"> · {errors} err</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="px-2 py-1 text-xs text-muted hover:text-white transition-colors"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
          <button
            onClick={() => onDelete(job.id)}
            className="p-1.5 text-muted hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border p-4 space-y-2">
          {/* Commands preview */}
          <details className="mb-3">
            <summary className="text-xs text-muted cursor-pointer hover:text-white select-none">
              Commands sent
            </summary>
            <pre className="mt-2 text-xs text-accent font-mono bg-[#0a0c12] rounded p-3 whitespace-pre-wrap">
              {job.commands}
            </pre>
          </details>
          {job.results.map((r) => (
            <ResultRow key={r.id} result={r} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BulkConfig() {
  const qc = useQueryClient();
  const [selected, setSelected]     = useState(new Set());
  const [search, setSearch]         = useState("");
  const [commands, setCommands]     = useState("");
  const [label, setLabel]           = useState("");
  const [running, setRunning]       = useState(false);
  const [activeJobId, setActiveJobId] = useState(null);
  const pollRef = useRef(null);

  const { data: devicesRes } = useQuery({
    queryKey: ["devices"],
    queryFn: () => devicesAPI.list(),
    select: (r) => r.data,
  });
  const devices = devicesRes || [];

  const { data: jobs = [], refetch: refetchJobs } = useQuery({
    queryKey: ["bulk-config-jobs"],
    queryFn: () => bulkConfigAPI.listJobs().then((r) => r.data),
    refetchInterval: false,
  });

  // Poll active job until done
  useEffect(() => {
    if (!activeJobId) return;
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await bulkConfigAPI.getJob(activeJobId);
        qc.setQueryData(["bulk-config-jobs"], (prev = []) =>
          prev.map((j) => (j.id === data.id ? data : j))
        );
        if (data.status === "done") {
          clearInterval(pollRef.current);
          setActiveJobId(null);
          setRunning(false);
        }
      } catch {
        clearInterval(pollRef.current);
      }
    }, 2000);
    return () => clearInterval(pollRef.current);
  }, [activeJobId]);

  const filtered = devices.filter(
    (d) =>
      d.hostname.toLowerCase().includes(search.toLowerCase()) ||
      d.ip_address.toLowerCase().includes(search.toLowerCase()) ||
      (d.location || "").toLowerCase().includes(search.toLowerCase())
  );

  const toggleDevice = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((d) => d.id)));
    }
  };

  const handleRun = async () => {
    if (!commands.trim()) { toast.error("Enter at least one command"); return; }
    if (selected.size === 0) { toast.error("Select at least one device"); return; }
    setRunning(true);
    try {
      const { data } = await bulkConfigAPI.createJob({
        device_ids: [...selected],
        commands: commands.trim(),
        label: label.trim() || undefined,
      });
      qc.setQueryData(["bulk-config-jobs"], (prev = []) => [data, ...prev]);
      setActiveJobId(data.id);
      toast.success(`Job started on ${data.results.length} device(s)`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to start job");
      setRunning(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await bulkConfigAPI.deleteJob(id);
      qc.setQueryData(["bulk-config-jobs"], (prev = []) => prev.filter((j) => j.id !== id));
    } catch {
      toast.error("Failed to delete job");
    }
  };

  return (
    <Layout title="Bulk Config">
      <div className="flex gap-6 h-full">
        {/* ── Left: device selector ── */}
        <div className="w-72 shrink-0 flex flex-col gap-3">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search devices…"
              className="w-full pl-8 pr-3 py-2 bg-surface border border-border rounded-lg text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent"
            />
          </div>

          <div className="bg-surface border border-border rounded-xl flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <button
                onClick={toggleAll}
                className="flex items-center gap-2 text-xs text-muted hover:text-white transition-colors"
              >
                {selected.size === filtered.length && filtered.length > 0
                  ? <CheckSquare size={13} className="text-accent" />
                  : <Square size={13} />}
                {selected.size > 0 ? `${selected.size} selected` : "Select all"}
              </button>
              {selected.size > 0 && (
                <button
                  onClick={() => setSelected(new Set())}
                  className="text-xs text-muted hover:text-white transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-xs text-muted p-4 text-center">No devices</p>
              ) : (
                filtered.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => toggleDevice(d.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-b border-border/50 last:border-0 ${
                      selected.has(d.id) ? "bg-accent/10" : "hover:bg-white/[0.02]"
                    }`}
                  >
                    {selected.has(d.id)
                      ? <CheckSquare size={13} className="text-accent shrink-0" />
                      : <Square size={13} className="text-muted shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-white truncate">{d.hostname}</p>
                      <p className="text-xs text-muted">{d.ip_address}</p>
                    </div>
                    <span className={`ml-auto text-xs shrink-0 ${
                      d.status === "online" ? "text-green-400" :
                      d.status === "offline" ? "text-red-400" : "text-muted"
                    }`}>
                      {d.status}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── Right: commands + history ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {/* Command editor */}
          <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Terminal size={15} className="text-accent" />
              <span className="text-sm font-medium text-white">Commands</span>
              <span className="text-xs text-muted ml-auto">One command per line</span>
            </div>

            <textarea
              value={commands}
              onChange={(e) => setCommands(e.target.value)}
              placeholder={"show version\nshow ip interface brief\nshow running-config"}
              rows={8}
              className="w-full bg-[#0a0c12] border border-border rounded-lg p-3 text-sm text-green-400 font-mono placeholder:text-muted/40 focus:outline-none focus:border-accent resize-y"
              spellCheck={false}
            />

            <div className="flex items-center gap-3">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Job label (optional)"
                className="flex-1 px-3 py-2 bg-bg border border-border rounded-lg text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent"
              />
              <button
                onClick={handleRun}
                disabled={running || selected.size === 0 || !commands.trim()}
                className="flex items-center gap-2 px-5 py-2 bg-accent hover:bg-accent/80 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {running
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Play size={14} />}
                Run on {selected.size} device{selected.size !== 1 ? "s" : ""}
              </button>
            </div>
          </div>

          {/* Job history */}
          <div className="flex-1 overflow-y-auto space-y-3">
            {jobs.length === 0 ? (
              <div className="bg-surface border border-border rounded-xl p-8 text-center text-muted text-sm">
                No jobs yet. Select devices and run commands above.
              </div>
            ) : (
              jobs.map((job) => (
                <JobCard key={job.id} job={job} onDelete={handleDelete} />
              ))
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
