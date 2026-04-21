# NMS Project — Build Status & Reference

## Qısa Xülasə
Tam işlək Network Management System qurulub.
- **Qovluq:** `c:\Users\A.Aliyev.3\Desktop\Network MGM project\nms\`
- **İşlətmək:** `docker compose up --build` (nms/ qovluğundan)
- **Brauzer:** `http://localhost`
- **Login:** `admin` / `Admin1234!`
- **Seed data:** `docker compose exec backend python seed.py`

---

## Stack
| Qat | Texnologiya |
|---|---|
| Backend | Python 3.11, FastAPI 0.111, SQLAlchemy 2.0, SQLite |
| Auth | JWT (python-jose), bcrypt (passlib), 4 saat access token |
| SSH | Paramiko 3.4 — WebSocket proxy, credentials heç vaxt brauzerə getmir |
| Monitoring | pysnmp 6.1, ICMP ping, APScheduler (30s interval) |
| Vault | AES-256 Fernet şifrələmə (PBKDF2HMAC, 480000 iter) |
| Frontend | React 18, Vite 5, TailwindCSS 3.4 |
| Terminal | @xterm/xterm 5.5 + WebSocket |
| Topology | ReactFlow 11 |
| Charts | Recharts 2.12 |
| Proxy | Nginx 1.25 (reverse proxy port 80) |
| Deploy | Docker Compose (3 konteyner) |

---

## Fayl Strukturu (62 fayl)

```
nms/
├── docker-compose.yml
├── .env                        ← default credentials (production-da dəyiş!)
├── .env.example
├── .gitignore
├── PROJECT_STATUS.md           ← BU FAYL
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py                 ← FastAPI app + lifespan (DB init + scheduler)
│   ├── database.py             ← SQLAlchemy engine + SessionLocal + get_db
│   ├── models.py               ← 13 ORM model
│   ├── schemas.py              ← Pydantic v2 schemas
│   ├── auth.py                 ← JWT + bcrypt + rate limiter + audit helper
│   ├── scheduler.py            ← APScheduler: poll(30s), backup(02:00), license(08:00)
│   ├── seed.py                 ← Demo data (devices, vault, subnets, inventory)
│   │
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── auth_router.py      ← POST /auth/login, GET /auth/me, POST /auth/refresh
│   │   ├── devices.py          ← CRUD + test-ssh + pull-config + config-history
│   │   ├── ssh.py              ← WS /ws/ssh/{device_id} — bidirectional SSH bridge
│   │   ├── ipam.py             ← Subnet CRUD + IP management + ICMP scan
│   │   ├── monitoring.py       ← Device metrics, manual poll endpoint
│   │   ├── alerts.py           ← Alert list, resolve, count
│   │   ├── vault.py            ← Credential CRUD + decrypt + copy (audit logged)
│   │   ├── inventory.py        ← Hardware inventory + licenses + expiry check
│   │   ├── files.py            ← Upload/download/delete (50MB limit, whitelist ext)
│   │   ├── backup.py           ← Backup list + download + restore via SSH
│   │   ├── settings.py         ← Key-value settings CRUD
│   │   └── audit.py            ← Audit log read (engineer/admin only)
│   │
│   └── services/
│       ├── __init__.py
│       ├── ssh_service.py      ← Paramiko: connect, run_command, get_config, interactive_channel
│       ├── crypto_service.py   ← AES-256 Fernet encrypt/decrypt
│       ├── ping_service.py     ← Async ICMP ping (cross-platform)
│       ├── snmp_service.py     ← pysnmp async GET (CPU, memory OIDs)
│       └── backup_service.py   ← pull_and_save_config helper
│
├── frontend/
│   ├── Dockerfile              ← 2-stage: node build → nginx serve
│   ├── nginx-frontend.conf     ← SPA fallback (try_files → index.html)
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js      ← Custom colors: bg, surface, accent, muted, border
│   ├── postcss.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx             ← BrowserRouter + Protected route wrapper
│       ├── api.js              ← Axios instance + tüm API çağırışları
│       ├── store.js            ← Zustand: auth token + alert count
│       ├── index.css           ← Tailwind directives + scrollbar styling
│       │
│       ├── components/
│       │   ├── Layout.jsx      ← Sidebar + Topbar wrapper, alert polling
│       │   ├── Sidebar.jsx     ← Nav links + logout
│       │   ├── Topbar.jsx      ← Title + alert badge + user info
│       │   └── StatusBadge.jsx ← Rəngli status badge (online/offline/warning/...)
│       │
│       └── pages/
│           ├── Login.jsx       ← Username/password form, JWT saxlama
│           ├── Dashboard.jsx   ← Stat kartları + son cihazlar + aktiv alertlər
│           ├── DeviceHub.jsx   ← Device CRUD cədvəli, SSH test, config pull
│           ├── SSHConsole.jsx  ← xterm.js terminal, sol panel cihaz seçimi
│           ├── IPAM.jsx        ← Subnet CRUD + IP cədvəli + ICMP scan
│           ├── Topology.jsx    ← ReactFlow network xəritəsi, cihaz panel
│           ├── Monitoring.jsx  ← Metric cədvəli + sparkline + alert resolve
│           ├── Inventory.jsx   ← Hardware + License tab, EOL xəbərdarlığı
│           ├── Files.jsx       ← Fayl upload/download/delete, folder yaratma
│           ├── Vault.jsx       ← Credential CRUD, şifrə reveal (10s), copy
│           ├── Docs.jsx        ← Daxili sənədləşmə
│           └── Settings.jsx    ← System settings + Audit log cədvəli
│
├── nginx/
│   ├── Dockerfile
│   └── nginx.conf              ← /api/ → backend, /ws/ → WS backend, / → frontend
│
└── data/                       ← Docker volumes (git-ignored)
    ├── db/                     ← nms.db (SQLite)
    ├── backups/                ← .cfg backup faylları
    ├── files/                  ← Yüklənmiş fayllar
    └── ssh_keys/               ← NMS SSH private keys
```

---

## Database Modelləri (models.py)
| Model | Cədvəl | Əsas sahələr |
|---|---|---|
| User | users | username, hashed_password, role (viewer/operator/engineer/admin) |
| Device | devices | hostname, ip_address, ssh_port, vendor, status, vault_credential_id |
| Subnet | subnets | cidr, gateway, vlan_id |
| IPAddress | ip_addresses | address, status (free/allocated/reserved), subnet_id |
| VaultCredential | vault_credentials | encrypted_password (AES-256), encrypted_enable_pass |
| ConfigBackup | config_backups | filepath, triggered_by (manual/scheduled/on-change) |
| Alert | alerts | severity (info/warning/critical), event_type, resolved |
| MetricSample | metric_samples | metric (cpu/memory/rtt_ms/packet_loss), value, timestamp |
| InventoryItem | inventory | model, vendor, serial_number, eol_date |
| License | licenses | expiry_date, license_type |
| AuditLog | audit_logs | user, action, target, ip_address |
| SSHSession | ssh_sessions | device_id, status (active/closed), log_path |
| FileEntry | files | name, path, size, file_type, folder |
| Setting | settings | key, value, description |

---

## API Endpointləri
```
POST   /auth/login
GET    /auth/me
POST   /auth/refresh

GET    /devices                  → bütün cihazlar
POST   /devices
PUT    /devices/{id}
DELETE /devices/{id}
POST   /devices/{id}/test-ssh
POST   /devices/{id}/pull-config
GET    /devices/{id}/config-history

WS     /ws/ssh/{device_id}       → xterm.js WebSocket SSH

GET    /ipam/subnets
POST   /ipam/subnets
PUT    /ipam/subnets/{id}
DELETE /ipam/subnets/{id}
GET    /ipam/subnets/{id}/addresses
POST   /ipam/scan/{subnet_id}
POST   /ipam/addresses

GET    /monitoring/devices
GET    /monitoring/{id}/metrics?metric=cpu&hours=24
POST   /monitoring/poll/{id}

GET    /alerts?resolved=false
PUT    /alerts/{id}/resolve
GET    /alerts/count

GET    /vault
POST   /vault
PUT    /vault/{id}
DELETE /vault/{id}
GET    /vault/{id}/password       → audit logged
POST   /vault/{id}/copy           → audit logged

GET    /inventory
POST   /inventory
PUT    /inventory/{id}
DELETE /inventory/{id}
GET    /licenses
POST   /licenses
GET    /licenses/expiring?days=90

GET    /backups?device_id=X
GET    /backups/{id}/download
POST   /backups/{device_id}/restore?backup_id=X

GET    /files?folder=/
POST   /files/upload?folder=/
GET    /files/{id}/download
DELETE /files/{id}
POST   /files/folder?folder=/new

GET    /settings
PUT    /settings

GET    /audit?limit=100
GET    /health
```

---

## Scheduler Jobs
| Job | Trigger | Nə edir |
|---|---|---|
| `poll_all_devices` | hər 30 saniyə | ICMP ping + SNMP CPU/memory, status yenilənir, threshold alertlər |
| `scheduled_config_backup` | hər gün 02:00 | Online cihazlardan running-config çəkir |
| `check_license_expiry` | hər gün 08:00 | 90/30/7 gün qalmış lisenziyalar üçün alert |

**Alert thresholds:**
- CPU: >70% warning, >90% critical
- Memory: >75% warning, >90% critical
- RTT: >50ms warning, >150ms critical
- Packet loss: >2% warning, >5% critical

---

## Təhlükəsizlik
- Şifrələr DB-də heç vaxt plain-text saxlanmır (bcrypt + AES-256)
- SSH credentials brauzerə heç vaxt göndərilmir — NMS proxy edir
- Vault girişi audit log-a yazılır
- Login rate limit: 1 dəqiqədə max 5 cəhd / IP
- File upload: 50MB limit, whitelist extension (.cfg, .txt, .json, .yaml, ...)
- JWT: 4 saat access token, 7 gün refresh token
- Rol sistemi: viewer / operator / engineer / admin

---

## Rəng Sxemi (Tailwind)
| Token | Hex | İstifadə |
|---|---|---|
| `bg` | #0f1117 | Əsas arxa fon |
| `surface` | #1a1d27 | Kartlar, sidebar |
| `accent` | #4f7cff | Aktiv elementlər, düymələr |
| `border` | #2a2d3e | Bölücü xətlər |
| `muted` | #8892a4 | İkinci dərəcəli mətn |
| `online` | #22c55e | Online status |
| `warning` | #f59e0b | Warning status |
| `critical/offline` | #ef4444 | Critical/offline |

---

## Environment Variables (.env)
```env
SECRET_KEY=...          # JWT imzalama (64+ char)
VAULT_MASTER_KEY=...    # AES-256 vault şifrələmə
FIRST_ADMIN_USERNAME=admin
FIRST_ADMIN_PASSWORD=Admin1234!
```

---

## Bilinən Məhdudiyyətlər
- SNMP v3 hələ tam dəstəklənmir (v1/v2c işləyir)
- Topology səhifəsi edge-ləri avtomatik çəkir (əl ilə redaktə yoxdur)
- Backup restore funksiyası Cisco IOS sintaksisinə uyğunlaşdırılıb
- SSH session log faylı DB-də saxlanır amma disk yazımı hələ tətbiq edilməyib
