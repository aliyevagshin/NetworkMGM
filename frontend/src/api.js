import axios from "axios";

const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("nms_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("nms_token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export const authAPI = {
  login: (username, password) => {
    const form = new URLSearchParams();
    form.append("username", username);
    form.append("password", password);
    return api.post("/auth/login", form, { headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  },
  me: () => api.get("/auth/me"),
};

export const devicesAPI = {
  list: () => api.get("/devices"),
  create: (data) => api.post("/devices", data),
  get: (id) => api.get(`/devices/${id}`),
  update: (id, data) => api.put(`/devices/${id}`, data),
  delete: (id) => api.delete(`/devices/${id}`),
  testSSH: (id) => api.post(`/devices/${id}/test-ssh`),
  pullConfig: (id) => api.post(`/devices/${id}/pull-config`),
  configHistory: (id) => api.get(`/devices/${id}/config-history`),
};

export const ipamAPI = {
  subnets: () => api.get("/ipam/subnets"),
  createSubnet: (data) => api.post("/ipam/subnets", data),
  updateSubnet: (id, data) => api.put(`/ipam/subnets/${id}`, data),
  deleteSubnet: (id) => api.delete(`/ipam/subnets/${id}`),
  addresses: (subnetId) => api.get(`/ipam/subnets/${subnetId}/addresses`),
  scan: (subnetId) => api.post(`/ipam/scan/${subnetId}`),
  createAddress: (data) => api.post("/ipam/addresses", data),
};

export const monitoringAPI = {
  all: () => api.get("/monitoring/devices"),
  metrics: (id, metric, hours) =>
    api.get(`/monitoring/${id}/metrics`, { params: { metric, hours } }),
  poll: (id) => api.post(`/monitoring/poll/${id}`),
};

export const alertsAPI = {
  list: (resolved = false) => api.get("/alerts", { params: { resolved } }),
  count: () => api.get("/alerts/count"),
  resolve: (id) => api.put(`/alerts/${id}/resolve`),
};

export const vaultAPI = {
  list: () => api.get("/vault"),
  create: (data) => api.post("/vault", data),
  update: (id, data) => api.put(`/vault/${id}`, data),
  delete: (id) => api.delete(`/vault/${id}`),
  getPassword: (id) => api.get(`/vault/${id}/password`),
  copy: (id) => api.post(`/vault/${id}/copy`),
};

export const inventoryAPI = {
  list: () => api.get("/inventory"),
  create: (data) => api.post("/inventory", data),
  update: (id, data) => api.put(`/inventory/${id}`, data),
  delete: (id) => api.delete(`/inventory/${id}`),
  licenses: () => api.get("/licenses"),
  createLicense: (data) => api.post("/licenses", data),
  expiring: (days) => api.get("/licenses/expiring", { params: { days } }),
};

export const backupsAPI = {
  list: (deviceId) => api.get("/backups", deviceId ? { params: { device_id: deviceId } } : {}),
  download: (id) => `${api.defaults.baseURL}/backups/${id}/download`,
  restore: (deviceId, backupId) => api.post(`/backups/${deviceId}/restore`, null, { params: { backup_id: backupId } }),
};

export const filesAPI = {
  list: (folder = "/") => api.get("/files", { params: { folder } }),
  upload: (file, folder = "/") => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post(`/files/upload?folder=${encodeURIComponent(folder)}`, fd);
  },
  download: (id) => `${api.defaults.baseURL}/files/${id}/download`,
  delete: (id) => api.delete(`/files/${id}`),
  createFolder: (folder) => api.post(`/files/folder?folder=${encodeURIComponent(folder)}`),
};

export const settingsAPI = {
  get: () => api.get("/settings"),
  update: (settings) => api.put("/settings", { settings }),
};

export const auditAPI = {
  list: (limit = 100) => api.get("/audit", { params: { limit } }),
};

export default api;
