# NMS — Network Management System

> Full-stack network management platform built with FastAPI + React.

---

## Tech Stack

### Backend
| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Runtime | Python | 3.11 | Backend language |
| Framework | FastAPI | 0.111.0 | REST API + WebSocket endpoints |
| ORM | SQLAlchemy | 2.0.30 | Database access layer |
| Database | SQLite (WAL mode) | — | Persistent storage (swappable to PostgreSQL) |
| Auth | python-jose + passlib/bcrypt | 3.3.0 / 1.7.4 | JWT tokens + password hashing |
| SSH | Paramiko | 3.4.0 | SSH connections to network devices |
| SNMP | pysnmp | 6.1.4 | SNMP polling (CPU, memory, interfaces) |
| Scheduler | APScheduler | 3.10.4 | Cron jobs (backup, polling, license checks) |
| Encryption | cryptography (Fernet/AES-256) | 42.0.5 | Vault credential encryption |
| LDAP | ldap3 | 2.9.1 | Active Directory / LDAP authentication |
| Async server | uvicorn + uvloop | 0.29.0 / 0.19.0 | High-performance async HTTP server |
| Compression | FastAPI GZipMiddleware | built-in | Response compression (>1KB responses) |

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
| Reverse proxy | nginx | Routes /api/ → FastAPI, / → React, /ws/ → WebSocket |
| Containerisation | Docker + Docker Compose | 3-container setup (backend, frontend, nginx) |

---

## Architecture

```
Browser
  │
  ▼
nginx:80
  ├── /api/*   → FastAPI (port 8000)
  ├── /ws/*    → FastAPI WebSocket (SSH proxy)
  └── /*       → React SPA (port 3000)

FastAPI
  ├── Auth (JWT)
  ├── Devices CRUD + SSH test + config pull
  ├── IPAM — subnets, IP addresses, ICMP scan
  ├── Monitoring — SNMP/ICMP polling, metrics history
  ├── Alerts — threshold-based, auto-resolve
  ├── Vault — AES-256 encrypted credentials
  ├── KeyPass — password manager
  ├── Inventory — hardware + licenses + EOL tracking
  ├── Config Backups — scheduled + manual, restore via SSH
  ├── Files — upload/download/folder management
  ├── Topology — multi-project diagram save/load
  ├── Logs — system + device log entries
  ├── Audit — immutable action log
  ├── Users — role-based access (viewer/operator/engineer/admin)
  ├── LDAP — Active Directory integration
  └── Settings — key-value system config

SQLite (WAL mode)
  └── WAL journal + 64MB cache + memory-mapped I/O
      → safe concurrent reads during writes
```

---

## Modules / Pages

| Page | Description |
|------|-------------|
| Dashboard | Live device status, alert counts, metric summaries |
| Device Hub | CRUD, SSH test, config pull, auto-detect, history |
| SSH Console | xterm.js WebSocket terminal to any device |
| Topology | Drag-and-drop network diagrams — multi-project, cable types, port labels, PDF export |
| IPAM | Subnet management, IP allocation, ICMP scan |
| Monitoring | Charts: CPU, memory, RTT, packet loss per device |
| Inventory | Hardware items, licenses, EOL/expiry alerts |
| Config Backups | Per-device backup history, download, restore |
| Files | File repository with folder support, upload/download |
| Vault | Encrypted credential store with audit logging |
| KeyPass | General password manager with categories/tags |
| Logs | System and device log viewer |
| Audit Log | Immutable record of all sensitive actions |
| Users | User management with role assignment |
| Settings | System-wide settings (poll interval, backup schedule, etc.) |

---

## Performance Optimisations Applied

### Backend
- **SQLite WAL mode** — Write-Ahead Logging allows concurrent readers during writes
- **SQLite pragmas** — 64MB page cache, memory-mapped I/O (256MB), NORMAL sync
- **GZip middleware** — compresses API responses ≥1KB (JSON lists compress ~70-80%)
- **uvloop** — replaces asyncio event loop with libuv for ~2× async throughput
- **Connection pooling** — pre-configured for PostgreSQL migration (pool_size=20)

### Frontend
- **Vite manual chunk splitting** — 7 separate vendor bundles so browsers cache dependencies independently; only changed chunks re-download on updates
- **React Query** — deduplicates identical in-flight requests, caches responses, background-refetches stale data
- **TanStack Virtual** — renders only visible rows in large device/log tables (handles 10,000+ rows without jank)

---

## Running the Project

```bash
# Copy env file and fill in secrets
cp nms/.env.example nms/.env

# Build and start all containers
cd nms
docker compose up --build

# App available at http://localhost
# Default login: admin / (set FIRST_ADMIN_PASSWORD in .env)
```

---

## Environment Variables

```env
SECRET_KEY=<random 64-char string>
VAULT_MASTER_KEY=<vault encryption master password>
FIRST_ADMIN_USERNAME=admin
FIRST_ADMIN_PASSWORD=Admin1234!
DATABASE_URL=sqlite:////app/data/nms.db
```
