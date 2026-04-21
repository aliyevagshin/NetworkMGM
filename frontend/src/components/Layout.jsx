import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { useEffect } from "react";
import { alertsAPI, authAPI } from "../api";
import { useAlertStore, useAuthStore } from "../store";

export default function Layout({ title, children }) {
  const setCount = useAlertStore((s) => s.setCount);
  const setUser = useAuthStore((s) => s.setUser);

  useEffect(() => {
    authAPI.me().then((r) => setUser(r.data)).catch(() => {});

    const fetchAlerts = () =>
      alertsAPI.count().then((r) => setCount(r.data)).catch(() => {});
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, []);

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
