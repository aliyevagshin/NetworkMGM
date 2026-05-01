import { create } from "zustand";

// Apply saved theme before first render
const _saved = localStorage.getItem("nms_theme") || "dark";
if (_saved === "light") document.documentElement.classList.add("light");

export const useThemeStore = create((set) => ({
  theme: _saved,
  toggle: () =>
    set((s) => {
      const next = s.theme === "dark" ? "light" : "dark";
      localStorage.setItem("nms_theme", next);
      document.documentElement.classList.toggle("light", next === "light");
      return { theme: next };
    }),
}));

export const useAuthStore = create((set) => ({
  token: localStorage.getItem("nms_token"),
  user: null,
  setToken: (token) => {
    localStorage.setItem("nms_token", token);
    set({ token });
  },
  setUser: (user) => set({ user }),
  logout: () => {
    localStorage.removeItem("nms_token");
    set({ token: null, user: null });
  },
}));

export const useAlertStore = create((set) => ({
  count: { critical: 0, warning: 0 },
  setCount: (count) => set({ count }),
}));
