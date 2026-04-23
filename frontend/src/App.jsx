import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { useAuthStore } from "./store";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";

// Lazy-load heavy pages — each becomes its own JS chunk
const DeviceHub  = lazy(() => import("./pages/DeviceHub"));
const SSHConsole = lazy(() => import("./pages/SSHConsole"));
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
          <Route path="/ipam"      element={<Protected><IPAM /></Protected>} />
          <Route path="/topology"  element={<Protected><Topology /></Protected>} />
          <Route path="/monitoring" element={<Protected><Monitoring /></Protected>} />
          <Route path="/inventory" element={<Protected><Inventory /></Protected>} />
          <Route path="/files"     element={<Protected><Files /></Protected>} />
          <Route path="/vault"     element={<Protected><Vault /></Protected>} />
          <Route path="/keypass"   element={<Protected><KeyPass /></Protected>} />
          <Route path="/backup"    element={<Protected><Backup /></Protected>} />
          <Route path="/logs"      element={<Protected><Logs /></Protected>} />
          <Route path="/docs"      element={<Protected><Docs /></Protected>} />
          <Route path="/settings"  element={<Protected><Settings /></Protected>} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
