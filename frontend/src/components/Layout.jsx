import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { useEffect, useCallback } from "react";
import { authAPI } from "../api";
import { useAlertStore, useAuthStore } from "../store";
import { useMonitoringSSE } from "../hooks/useSSE";

export default function Layout({ title, children }) {
  const setCount = useAlertStore((s) => s.setCount);
  const setUser  = useAuthStore((s) => s.setUser);
  const user     = useAuthStore((s) => s.user);

  useEffect(() => {
    // Only fetch /auth/me on first load; subsequent tab switches skip the round-trip
    if (!user) {
      authAPI.me().then((r) => setUser(r.data)).catch(() => {});
    }
  }, []);

  // SSE replaces the 20s polling interval for alert badge counts
  const handleSSE = useCallback((payload) => {
    if (payload.type === "alerts") {
      setCount(payload.data);
    }
  }, [setCount]);

  useMonitoringSSE(handleSSE);

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title={title} />
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
