import { lazy, Suspense, Component } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { useAuthStore } from "./store";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", background: "#0f1117", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#1a1d27", border: "1px solid #ef4444", borderRadius: 12, padding: 24, maxWidth: 600, width: "100%" }}>
            <div style={{ color: "#ef4444", fontWeight: 600, marginBottom: 8 }}>Application Error</div>
            <pre style={{ color: "#e8eaf0", fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {this.state.error?.message}
              {"\n\n"}
              {this.state.error?.stack?.split("\n").slice(0, 6).join("\n")}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Lazy-load heavy pages — each becomes its own JS chunk
const DeviceHub  = lazy(() => import("./pages/DeviceHub"));
const SSHConsole  = lazy(() => import("./pages/SSHConsole"));
const WebConsole  = lazy(() => import("./pages/WebConsole"));
const IPAM       = lazy(() => import("./pages/IPAM"));
const Topology   = lazy(() => import("./pages/Topology"));
const Monitoring = lazy(() => import("./pages/Monitoring"));
const Inventory  = lazy(() => import("./pages/Inventory"));
const Files      = lazy(() => import("./pages/Files"));
const Vault      = lazy(() => import("./pages/Vault"));
const Docs       = lazy(() => import("./pages/Docs"));
const Settings   = lazy(() => import("./pages/Settings"));
const Backup     = lazy(() => import("./pages/Backup"));
const Logs       = lazy(() => import("./pages/Logs"));
const BulkConfig = lazy(() => import("./pages/BulkConfig"));
const KeyPass    = lazy(() => import("./pages/KeyPass"));

function PageLoader() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function Protected({ children }) {
  const token = useAuthStore((s) => s.token);
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: "#1a1d27", color: "#e8eaf0", border: "1px solid #2a2d3e" },
        }}
      />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/"          element={<Protected><Dashboard /></Protected>} />
          <Route path="/devices"   element={<Protected><DeviceHub /></Protected>} />
          <Route path="/ssh"       element={<Protected><SSHConsole /></Protected>} />
          <Route path="/webconsole" element={<Protected><WebConsole /></Protected>} />
          <Route path="/ipam"      element={<Protected><IPAM /></Protected>} />
          <Route path="/topology"  element={<Protected><Topology /></Protected>} />
          <Route path="/monitoring" element={<Protected><Monitoring /></Protected>} />
          <Route path="/inventory" element={<Protected><Inventory /></Protected>} />
          <Route path="/files"     element={<Protected><Files /></Protected>} />
          <Route path="/vault"     element={<Protected><Vault /></Protected>} />
          <Route path="/keypass"   element={<Protected><KeyPass /></Protected>} />
          <Route path="/backup"    element={<Protected><Backup /></Protected>} />
          <Route path="/bulk-config" element={<Protected><BulkConfig /></Protected>} />
          <Route path="/logs"      element={<Protected><Logs /></Protected>} />
          <Route path="/docs"      element={<Protected><Docs /></Protected>} />
          <Route path="/settings"  element={<Protected><Settings /></Protected>} />
        </Routes>
      </Suspense>
    </BrowserRouter>
    </ErrorBoundary>
  );
}
