import { create } from "zustand";

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
