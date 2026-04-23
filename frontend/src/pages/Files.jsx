import { useEffect, useState, useRef } from "react";
import Layout from "../components/Layout";
import { filesAPI } from "../api";
import { Upload, Download, Trash2, FolderPlus, Folder, File, ChevronRight, Home } from "lucide-react";
import toast from "react-hot-toast";
import { format } from "date-fns";

function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function Breadcrumb({ folder, onNavigate }) {
  const parts = folder === "/" ? [] : folder.split("/").filter(Boolean);
  return (
    <div className="flex items-center gap-1 text-sm text-muted flex-wrap">
      <button onClick={() => onNavigate("/")} className="hover:text-white transition-colors">
        <Home size={13} />
      </button>
      {parts.map((part, i) => {
        const path = "/" + parts.slice(0, i + 1).join("/");
        return (
          <span key={path} className="flex items-center gap-1">
            <ChevronRight size={12} />
            <button onClick={() => onNavigate(path)} className="hover:text-white transition-colors font-mono">
              {part}
            </button>
          </span>
        );
      })}
    </div>
  );
}

export default function Files() {
  const [folder, setFolder] = useState("/");
  const [files, setFiles] = useState([]);
  const [subfolders, setSubfolders] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [newFolder, setNewFolder] = useState("");
  const fileRef = useRef();

  const load = () => {
    filesAPI.list(folder).then((r) => setFiles(r.data));
    filesAPI.folders(folder).then((r) => setSubfolders(r.data)).catch(() => setSubfolders([]));
  };

  useEffect(() => { load(); }, [folder]);

  const navigate = (path) => setFolder(path);

  const upload = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setUploading(true);
    toast.loading("Uploading...", { id: "upload" });
    try {
      await filesAPI.upload(f, folder);
      toast.success("Uploaded", { id: "upload" });
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed", { id: "upload" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const del = async (id) => {
    if (!confirm("Delete file?")) return;
    await filesAPI.delete(id);
    toast.success("Deleted");
    load();
  };

  const mkDir = async () => {
    if (!newFolder.trim()) return;
    const path = (folder === "/" ? "" : folder) + "/" + newFolder.trim();
    await filesAPI.createFolder(path);
    toast.success("Folder created");
    setNewFolder("");
    load();
  };

  return (
    <Layout title="Files">
      <div className="flex items-center gap-3 mb-4">
        <Breadcrumb folder={folder} onNavigate={navigate} />
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <input
            placeholder="New folder name"
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && mkDir()}
            className="bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-white w-40 focus:outline-none focus:border-accent"
          />
          <button onClick={mkDir} className="p-1.5 text-muted hover:text-white border border-border rounded-lg transition-colors" title="Create folder">
            <FolderPlus size={14} />
          </button>
          <button onClick={() => fileRef.current.click()} disabled={uploading}
            className="flex items-center gap-2 px-4 py-1.5 bg-accent text-white text-sm rounded-lg transition-colors disabled:opacity-50">
            <Upload size={14} />
            {uploading ? "Uploading..." : "Upload"}
          </button>
          <input ref={fileRef} type="file" className="hidden" onChange={upload} />
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr>
              {["Name", "Type", "Size", "Uploaded By", "Date"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted">{h}</th>
              ))}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {subfolders.map((sf) => (
              <tr key={sf.path} className="hover:bg-white/2 transition-colors cursor-pointer" onClick={() => navigate(sf.path)}>
                <td className="px-4 py-2.5 text-accent flex items-center gap-2">
                  <Folder size={14} className="shrink-0" />
                  <span className="font-mono">{sf.name}</span>
                </td>
                <td className="px-4 py-2.5 text-muted text-xs">folder</td>
                <td className="px-4 py-2.5 text-muted text-xs">—</td>
                <td className="px-4 py-2.5 text-muted text-xs">—</td>
                <td className="px-4 py-2.5 text-muted text-xs">—</td>
                <td className="px-4 py-2.5">
                  <ChevronRight size={14} className="text-muted" />
                </td>
              </tr>
            ))}
            {files.map((f) => (
              <tr key={f.id} className="hover:bg-white/2 transition-colors">
                <td className="px-4 py-2.5 text-white flex items-center gap-2">
                  <File size={13} className="text-muted shrink-0" />
                  <span className="font-mono truncate max-w-xs">{f.name}</span>
                </td>
                <td className="px-4 py-2.5 text-muted text-xs font-mono">.{f.file_type}</td>
                <td className="px-4 py-2.5 text-muted text-xs">{formatBytes(f.size)}</td>
                <td className="px-4 py-2.5 text-muted text-xs">{f.uploaded_by}</td>
                <td className="px-4 py-2.5 text-muted text-xs font-mono">
                  {format(new Date(f.created_at), "yyyy-MM-dd HH:mm")}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1">
                    <a href={filesAPI.download(f.id)} download target="_blank" rel="noreferrer"
                      className="p-1.5 text-muted hover:text-accent rounded transition-colors">
                      <Download size={13} />
                    </a>
                    <button onClick={() => del(f.id)} className="p-1.5 text-muted hover:text-red-400 rounded transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {subfolders.length === 0 && files.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted text-sm">No files or folders here</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
