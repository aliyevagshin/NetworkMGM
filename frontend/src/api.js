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
  autoDetect: (id) => api.post(`/devices/${id}/detect`),
  discover: (subnet) => api.post("/devices/discover", { subnet }),
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
  delete: (id) => api.delete(`/backups/${id}`),
  restore: (deviceId, backupId) => api.post(`/backups/${deviceId}/restore`, null, { params: { backup_id: backupId } }),
};

export const filesAPI = {
  list: (folder = "/") => api.get("/files", { params: { folder } }),
  folders: (folder = "/") => api.get("/files/folders", { params: { folder } }),
  upload: (file, folder = "/") => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post(`/files/upload?folder=${encodeURIComponent(folder)}`, fd);
  },
  download: (id) => `${api.defaults.baseURL}/files/${id}/download`,
  delete: (id) => api.delete(`/files/${id}`),
  createFolder: (folder) => api.post(`/files/folder?folder=${encodeURIComponent(folder)}`),
  deleteFolder: (folder) => api.delete(`/files/folder?folder=${encodeURIComponent(folder)}`),
};

export const settingsAPI = {
  get: () => api.get("/settings"),
  update: (settings) => api.put("/settings", { settings }),
};

export const auditAPI = {
  list: (params = {}) => api.get("/audit", { params: { limit: 200, ...params } }),
};

export const usersAPI = {
  list: () => api.get("/users"),
  create: (data) => api.post("/users", data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
};

export const topologyAPI = {
  links: () => api.get("/topology/links"),
  createLink: (data) => api.post("/topology/links", data),
  updateLink: (id, data) => api.put(`/topology/links/${id}`, data),
  deleteLink: (id) => api.delete(`/topology/links/${id}`),
};

export const logsAPI = {
  list: (params = {}) => api.get("/logs", { params }),
  create: (data) => api.post("/logs", data),
  clear: () => api.delete("/logs/clear"),
};

export const keypassAPI = {
  list: () => api.get("/keypass"),
  create: (data) => api.post("/keypass", data),
  update: (id, data) => api.put(`/keypass/${id}`, data),
  delete: (id) => api.delete(`/keypass/${id}`),
  getPassword: (id) => api.get(`/keypass/${id}/password`),
};

export const ldapAPI = {
  get: () => api.get("/ldap"),
  update: (data) => api.put("/ldap", data),
  test: (username, password) => api.post("/ldap/test", null, { params: { username, password } }),
};

export const topologiesAPI = {
  list: () => api.get("/topologies"),
  create: (data) => api.post("/topologies", data),
  get: (id) => api.get(`/topologies/${id}`),
  update: (id, data) => api.put(`/topologies/${id}`, data),
  delete: (id) => api.delete(`/topologies/${id}`),
};

export const bulkConfigAPI = {
  createJob: (data) => api.post("/bulk-config/jobs", data),
  listJobs: () => api.get("/bulk-config/jobs"),
  getJob: (id) => api.get(`/bulk-config/jobs/${id}`),
  deleteJob: (id) => api.delete(`/bulk-config/jobs/${id}`),
};

export const netflowAPI = {
  devices: () => api.get("/netflow/devices"),
  flows: (params) => api.get("/netflow/flows", { params }),
  summary: (deviceId, hours = 1) =>
    api.get("/netflow/summary", { params: { device_id: deviceId || undefined, hours } }),
};

export default api;
