export default function StatusBadge({ status }) {
  const map = {
    online: "bg-green-500/20 text-green-400 border-green-500/30",
    offline: "bg-red-500/20 text-red-400 border-red-500/30",
    warning: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    unknown: "bg-gray-500/20 text-gray-400 border-gray-500/30",
    active: "bg-green-500/20 text-green-400 border-green-500/30",
    closed: "bg-gray-500/20 text-gray-400 border-gray-500/30",
    free: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    allocated: "bg-green-500/20 text-green-400 border-green-500/30",
    reserved: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    critical: "bg-red-500/20 text-red-400 border-red-500/30",
    info: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  };
  const cls = map[status] || map.unknown;
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {status}
    </span>
  );
}
