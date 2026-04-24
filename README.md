# NMS — Network Management System

> Full-stack network management platform built with FastAPI + React.

---

## Tech Stack

### Backend
| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Runtime | Python | 3.11 | Backend language |
| Framework | FastAPI | 0.111.0 | REST API + WebSocket + SSE endpoints |
| ORM | SQLAlchemy | 2.0.30 | Database access layer |
| Database | PostgreSQL + TimescaleDB | 16 | Persistent storage + time-series hypertables |
| Task queue | Celery + Redis | 5.3.6 / 7 | Async SSH/backup/IPAM tasks |
| Auth | python-jose + passlib/bcrypt | 3.3.0 / 1.7.4 | JWT tokens + password hashing |
| SSH | Paramiko | 3.4.0 | SSH connections to network devices |
| Multi-vendor SSH | Netmiko | 4.3.0 | Bulk config push with vendor-aware prompt handling |
| SNMP | pysnmp | 6.1.4 | SNMP polling (CPU, memory, interfaces) |
| Scheduler | APScheduler | 3.10.4 | Cron jobs (backup, polling, license checks) |
| Encryption | cryptography (Fernet/AES-256) | 42.0.5 | Vault credential encryption |
| LDAP | ldap3 | 2.9.1 | Active Directory / LDAP authentication |
| Async server | uvicorn + uvloop | 0.29.0 / 0.19.0 | High-performance async HTTP server |
| Compression | FastAPI GZipMiddleware | built-in | Response compression (>1KB responses) |
| Metrics | prometheus-fastapi-instrumentator | 6.1.0 | `/metrics` endpoint for Prometheus |

### Frontend
| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Framework | React | 18.3.1 | UI framework |
| Build tool | Vite | 5.2.11 | Fast dev server + optimized production build |
| Styling | TailwindCSS | 3.4.4 | Utility-first dark theme UI |
| HTTP client | Axios | 1.7.2 | API calls with JWT interceptors |
| State | Zustand | 4.5.2 | Lightweight global state |
| Server state | TanStack React Query | 5.40.0 | API caching, deduplication, background refetch |
| Virtualisation | TanStack Virtual | 3.5.0 | Efficient rendering of large device/log lists |
| Network diagram | ReactFlow | 11.11.3 | Interactive topology canvas (drag, cable, port labels) |
| Charts | Recharts | 2.12.7 | CPU/memory/traffic sparklines |
| Terminal | @xterm/xterm | 5.5.0 | WebSocket SSH terminal (xterm.js) |
| Icons | Lucide React | 0.383.0 | UI icons |
| Notifications | react-hot-toast | 2.4.1 | Toast notifications |
| PDF export | html2canvas + jsPDF | 1.4.1 / 2.5.1 | Topology PDF export |

### Infrastructure
| Component | Technology | Purpose |
|-----------|-----------|---------|
| Reverse proxy | nginx | Routes /api/ → FastAPI, /ws/ → WebSocket, static asset caching |
| Task queue | Celery worker | Processes async SSH/backup/IPAM tasks from Redis queue |
| Metrics | Prometheus | Scrapes backend + Celery worker metrics every 15s |
| Dashboards | Grafana | Pre-provisioned Prometheus datasource, 30d retention |
| Database | PostgreSQL + TimescaleDB | Relational storage + time-series hypertable for metrics |
| Containerisation | Docker Compose | Full stack: postgres, redis, backend, celery, frontend, nginx, prometheus, grafana |

---

## Architecture

```
Browser
  │
  ▼
nginx:80
  ├── /api/monitoring/stream  → FastAPI SSE (no buffering)
  ├── /api/*                  → FastAPI (port 8000)
  ├── /ws/*                   → FastAPI WebSocket (SSH proxy)
  ├── /metrics                → FastAPI /metrics (Prometheus)
  └── /*                      → React SPA (port 3000, cached 1y for hashed assets)

FastAPI
  ├── Auth (JWT + Redis-backed rate limiting on /login)
  ├── Devices CRUD + SSH test + config pull  ──► Celery worker (async)
  ├── Bulk Config — parallel Netmiko push to N devices ──► Celery worker (async)
  ├── IPAM — subnets, IP addresses, ICMP scan ──► Celery worker (async)
  ├── Monitoring — SNMP/ICMP polling, SSE stream
  ├── Alerts — threshold-based, auto-resolve
  ├── Vault — AES-256 encrypted credentials (+ enable password)
  ├── KeyPass — password manager
  ├── Inventory — hardware + licenses + EOL tracking
  ├── Config Backups — scheduled + manual
  ├── Files — upload/download/folder management
  ├── Topology — multi-project diagram save/load
  ├── Logs — system + device log entries
  ├── Audit — immutable action log
  ├── Users — role-based access (viewer/operator/engineer/admin)
  ├── LDAP — Active Directory integration
  └── Settings — key-value system config

PostgreSQL + TimescaleDB
  ├── metric_samples → hypertable (time-series, auto-partitioned by timestamp)
  └── Connection pool: size=20, overflow=30, pre-ping, recycle=300s

Redis
  ├── Celery broker + backend
  ├── API response cache (30s TTL for device list)
  └── Login rate-limit counters (5 attempts / 60s per IP)

Prometheus → scrapes :8000/metrics + :8001/metrics every 15s
Grafana    → reads Prometheus, port 3001
```

---

## Modules / Pages

| Page | Description |
|------|-------------|
| Dashboard | Live device status, alert counts, metric summaries |
| Device Hub | CRUD, SSH test, config pull, auto-detect, history |
| SSH Console | xterm.js WebSocket terminal to any device |
| Topology | Drag-and-drop network diagrams — multi-project, cable types, port labels, text labels, PDF export |
| IPAM | Subnet management, IP allocation, ICMP scan |
| Monitoring | Charts: CPU, memory, RTT, packet loss per device — live via SSE |
| Inventory | Hardware items, licenses, EOL/expiry alerts |
| Config Backups | Per-device backup history, download, restore |
| Files | File repository with folder support, upload/download |
| Vault | Encrypted credential store with audit logging |
| KeyPass | General password manager with categories/tags |
| Logs | System and device log viewer |
| Audit Log | Immutable record of all sensitive actions |
| Users | User management with role assignment |
| Bulk Config | Select devices + write commands → parallel Netmiko execution with live results |
| Settings | System-wide settings (poll interval, backup schedule, etc.) |

---

## Performance Optimisations

### Real-time push (SSE)
- `/api/monitoring/stream` pushes device status + alert counts every 8s
- Replaces polling on Monitoring and Dashboard pages — zero wasted requests when nothing changes
- Exponential back-off reconnect (1s → 30s max) on disconnect
- nginx configured with `proxy_buffering off` so events reach the browser immediately

### Async task queue (Celery + Redis)
- SSH test, config pull, and bulk config push are offloaded to Celery workers — API responds instantly with `{"queued": true}`
- Bulk Config runs one Celery task per device in parallel — N devices execute simultaneously
- IPAM subnet scan runs fully async (up to 254 hosts in parallel with semaphore=30)
- Graceful sync fallback when Redis is unavailable (e.g. local dev without Docker)

### Bulk Config (Netmiko)
- Multi-vendor aware: auto-maps device vendor/OS to correct Netmiko driver (cisco_ios, cisco_xe, cisco_xr, cisco_nxos, cisco_asa, juniper_junos, arista_eos, fortinet, paloalto_panos, checkpoint_gaia, hp_procurve, hp_comware, mikrotik_routeros)
- Automatically distinguishes show commands (`send_command`) from config blocks (`send_config_set`) — `conf t … end` blocks are handled correctly
- Enable password support: if Vault credential has an enable password, Netmiko escalates to privileged exec automatically
- Job history persisted in DB; per-device output with timing visible in UI

### Time-series database (TimescaleDB)
- `metric_samples` table is a TimescaleDB hypertable partitioned by `timestamp`
- Chunk-based storage gives orders-of-magnitude faster range queries vs plain PostgreSQL table scans
- Hypertable created automatically on first startup via `create_hypertable(..., if_not_exists=TRUE)`

### nginx caching + gzip
- Static JS/CSS/font assets served with `Cache-Control: public, immutable; expires 1y` — browser caches across deployments (Vite hashes filenames)
- `index.html` served with `no-cache` so new deploys are picked up immediately
- gzip level 5 on all text responses; GZipMiddleware in FastAPI for direct connections

### Metrics + observability (Prometheus + Grafana)
- FastAPI auto-instruments all routes via `prometheus-fastapi-instrumentator` — request count, latency histograms, status codes exposed at `/metrics`
- Prometheus scrapes backend + Celery worker every 15s, retains 30 days
- Grafana pre-provisioned with Prometheus datasource at `http://localhost:3001` (admin / `GRAFANA_PASSWORD`)

### Security hardening
- Login rate limiting: 5 attempts per IP per 60s, backed by Redis (survives backend restarts)
- CORS origins configurable via `ALLOWED_ORIGINS` env var (default `*` for dev, set to your domain in prod)
- Vault credentials encrypted with AES-256 Fernet; enable passwords stored and decrypted separately

### Frontend bundle splitting (Vite)
- Vendor chunks split by function: react + router, reactflow, xterm, query, pdf
- `manualChunks` as a function (not object) ensures React deduplication across all transitive deps
- Only changed chunks re-download on app updates; large deps cached independently

### Database tuning
- PostgreSQL connection pool: `pool_size=20`, `max_overflow=30`, `pool_pre_ping=True`, `pool_recycle=300`
- SQLite (local dev): WAL mode, 64MB page cache, 256MB mmap, NORMAL sync

---

## Running the Project

```bash
# Copy env file and fill in secrets
cp .env.example .env

# Build and start all containers
docker compose up --build

# App:       http://localhost
# Grafana:   http://localhost:3001  (admin / GRAFANA_PASSWORD)
# Prometheus: http://localhost:9090
# Default login: admin / (set FIRST_ADMIN_PASSWORD in .env)
```

---

## Environment Variables

```env
SECRET_KEY=<random 64-char string>
VAULT_MASTER_KEY=<vault encryption master password>
FIRST_ADMIN_USERNAME=admin
FIRST_ADMIN_PASSWORD=Admin1234!
POSTGRES_USER=nms
POSTGRES_PASSWORD=nmspassword
POSTGRES_DB=nmsdb
GRAFANA_PASSWORD=admin
DATABASE_URL=postgresql://nms:nmspassword@postgres:5432/nmsdb
REDIS_URL=redis://redis:6379/0
ALLOWED_ORIGINS=http://localhost,http://yourdomain.com
```

> `.env` is git-ignored. Never commit secrets to version control.
