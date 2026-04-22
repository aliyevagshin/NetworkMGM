import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { useEffect } from "react";
import { alertsAPI, authAPI } from "../api";
import { useAlertStore, useAuthStore } from "../store";
import { useQuery } from "@tanstack/react-query";

export default function Layout({ title, children }) {
  const setCount = useAlertStore((s) => s.setCount);
  const setUser = useAuthStore((s) => s.setUser);

  useEffect(() => {
    authAPI.me().then((r) => setUser(r.data)).catch(() => {});
  }, []);

  useQuery({
    queryKey: ["alert-count"],
    queryFn: () => alertsAPI.count().then((r) => { setCount(r.data); return r.data; }),
    staleTime: 10_000,
    refetchInterval: 20_000,
  });

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
