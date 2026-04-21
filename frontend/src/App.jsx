import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { useAuthStore } from "./store";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import DeviceHub from "./pages/DeviceHub";
import SSHConsole from "./pages/SSHConsole";
import IPAM from "./pages/IPAM";
import Topology from "./pages/Topology";
import Monitoring from "./pages/Monitoring";
import Inventory from "./pages/Inventory";
import Files from "./pages/Files";
import Vault from "./pages/Vault";
import Docs from "./pages/Docs";
import Settings from "./pages/Settings";
import Backup from "./pages/Backup";
import Logs from "./pages/Logs";
import KeyPass from "./pages/KeyPass";

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
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Protected><Dashboard /></Protected>} />
        <Route path="/devices" element={<Protected><DeviceHub /></Protected>} />
        <Route path="/ssh" element={<Protected><SSHConsole /></Protected>} />
        <Route path="/ipam" element={<Protected><IPAM /></Protected>} />
        <Route path="/topology" element={<Protected><Topology /></Protected>} />
        <Route path="/monitoring" element={<Protected><Monitoring /></Protected>} />
        <Route path="/inventory" element={<Protected><Inventory /></Protected>} />
        <Route path="/files" element={<Protected><Files /></Protected>} />
        <Route path="/vault" element={<Protected><Vault /></Protected>} />
        <Route path="/keypass" element={<Protected><KeyPass /></Protected>} />
        <Route path="/backup" element={<Protected><Backup /></Protected>} />
        <Route path="/logs" element={<Protected><Logs /></Protected>} />
        <Route path="/docs" element={<Protected><Docs /></Protected>} />
        <Route path="/settings" element={<Protected><Settings /></Protected>} />
      </Routes>
    </BrowserRouter>
  );
}
