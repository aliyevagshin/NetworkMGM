from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Float, ForeignKey, Index
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String, default="operator")  # viewer/operator/engineer/admin
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Device(Base):
    __tablename__ = "devices"
    id = Column(Integer, primary_key=True)
    hostname = Column(String, unique=True, index=True)
    ip_address = Column(String, index=True)
    ssh_port = Column(Integer, default=22)
    device_type = Column(String)   # router/switch/firewall/ap/server
    vendor = Column(String)
    os_version = Column(String)
    location = Column(String)
    status = Column(String, default="unknown")  # online/offline/warning
    snmp_community = Column(String)
    snmp_version = Column(String, default="v2c")
    vault_credential_id = Column(Integer, ForeignKey("vault_credentials.id"), nullable=True)
    last_seen = Column(DateTime)
    last_backup = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    backups = relationship("ConfigBackup", back_populates="device")
    alerts = relationship("Alert", back_populates="device")


class Subnet(Base):
    __tablename__ = "subnets"
    id = Column(Integer, primary_key=True)
    name = Column(String)
    cidr = Column(String, unique=True)
    gateway = Column(String)
    vlan_id = Column(Integer)
    description = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    ip_addresses = relationship("IPAddress", back_populates="subnet")


class IPAddress(Base):
    __tablename__ = "ip_addresses"
    id = Column(Integer, primary_key=True)
    address = Column(String, unique=True)
    subnet_id = Column(Integer, ForeignKey("subnets.id"))
    hostname = Column(String, nullable=True)
    mac_address = Column(String, nullable=True)
    status = Column(String, default="free")  # free/allocated/reserved
    description = Column(String)
    subnet = relationship("Subnet", back_populates="ip_addresses")


class VaultCredential(Base):
    __tablename__ = "vault_credentials"
    id = Column(Integer, primary_key=True)
    name = Column(String)
    username = Column(String)
    encrypted_password = Column(Text)
    encrypted_enable_pass = Column(Text)
    ssh_key_path = Column(String, nullable=True)
    tags = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)


class ConfigBackup(Base):
    __tablename__ = "config_backups"
    id = Column(Integer, primary_key=True)
    device_id = Column(Integer, ForeignKey("devices.id"))
    filepath = Column(String)
    file_size = Column(Integer)
    triggered_by = Column(String)  # scheduled/manual/on-change
    created_at = Column(DateTime, default=datetime.utcnow)
    device = relationship("Device", back_populates="backups")


class Alert(Base):
    __tablename__ = "alerts"
    id = Column(Integer, primary_key=True)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=True, index=True)
    severity = Column(String)
    event_type = Column(String, index=True)
    message = Column(Text)
    resolved = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    device = relationship("Device", back_populates="alerts")

    __table_args__ = (
        Index("ix_alert_device_resolved", "device_id", "resolved"),
    )


class MetricSample(Base):
    __tablename__ = "metric_samples"
    id = Column(Integer, primary_key=True)
    device_id = Column(Integer, ForeignKey("devices.id"), index=True)
    metric = Column(String, index=True)
    value = Column(Float)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        Index("ix_metricsample_device_metric_ts", "device_id", "metric", "timestamp"),
    )


class InventoryItem(Base):
    __tablename__ = "inventory"
    id = Column(Integer, primary_key=True)
    name = Column(String)
    model = Column(String)
    vendor = Column(String)
    serial_number = Column(String)
    ip_address = Column(String, nullable=True)
    quantity = Column(Integer, default=1)
    device_type = Column(String)
    location = Column(String)
    purchase_date = Column(DateTime, nullable=True)
    eol_date = Column(DateTime, nullable=True)


class License(Base):
    __tablename__ = "licenses"
    id = Column(Integer, primary_key=True)
    name = Column(String)
    license_type = Column(String)
    vendor = Column(String)
    expiry_date = Column(DateTime)
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True)
    user = Column(String)
    action = Column(String)
    target = Column(String)
    details = Column(Text)
    ip_address = Column(String)
    timestamp = Column(DateTime, default=datetime.utcnow)


class SSHSession(Base):
    __tablename__ = "ssh_sessions"
    id = Column(Integer, primary_key=True)
    device_id = Column(Integer, ForeignKey("devices.id"))
    user = Column(String)
    status = Column(String, default="active")  # active/closed
    log_path = Column(String)
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)


class FileEntry(Base):
    __tablename__ = "files"
    id = Column(Integer, primary_key=True)
    name = Column(String)
    path = Column(String)
    size = Column(Integer)
    file_type = Column(String)
    folder = Column(String, default="/")
    uploaded_by = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)


class Setting(Base):
    __tablename__ = "settings"
    id = Column(Integer, primary_key=True)
    key = Column(String, unique=True)
    value = Column(String)
    description = Column(String)


class DeviceLink(Base):
    __tablename__ = "device_links"
    id = Column(Integer, primary_key=True)
    source_device_id = Column(Integer, ForeignKey("devices.id"))
    target_device_id = Column(Integer, ForeignKey("devices.id"))
    source_port = Column(String, nullable=True)
    target_port = Column(String, nullable=True)
    link_type = Column(String, default="ethernet")  # ethernet/fiber/wifi/lag
    created_at = Column(DateTime, default=datetime.utcnow)


class LogEntry(Base):
    __tablename__ = "log_entries"
    id = Column(Integer, primary_key=True)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=True, index=True)
    level = Column(String, default="info", index=True)
    source = Column(String, default="system")
    message = Column(Text)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)


class KeyPassEntry(Base):
    __tablename__ = "keypass_entries"
    id = Column(Integer, primary_key=True)
    name = Column(String)
    username = Column(String, nullable=True)
    encrypted_password = Column(Text, nullable=True)
    url = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    tags = Column(String, nullable=True)
    category = Column(String, default="General")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)


class TopologyProject(Base):
    __tablename__ = "topology_projects"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False, default="New Topology")
    data = Column(Text, default="{}")  # JSON: {nodes: [], edges: []}
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class BulkConfigJob(Base):
    __tablename__ = "bulk_config_jobs"
    id = Column(Integer, primary_key=True)
    label = Column(String, nullable=True)
    commands = Column(Text)
    status = Column(String, default="running")  # running/done
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    results = relationship("BulkConfigResult", back_populates="job", cascade="all, delete-orphan")


class BulkConfigResult(Base):
    __tablename__ = "bulk_config_results"
    id = Column(Integer, primary_key=True)
    job_id = Column(Integer, ForeignKey("bulk_config_jobs.id"))
    device_id = Column(Integer, ForeignKey("devices.id", ondelete="SET NULL"), nullable=True)
    device_hostname = Column(String)
    device_ip = Column(String)
    status = Column(String, default="pending")  # pending/running/success/error
    output = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    job = relationship("BulkConfigJob", back_populates="results")
    device = relationship("Device", foreign_keys=[device_id])


class LDAPConfig(Base):
    __tablename__ = "ldap_config"
    id = Column(Integer, primary_key=True)
    server = Column(String, nullable=True)
    port = Column(Integer, default=389)
    use_ssl = Column(Boolean, default=False)
    base_dn = Column(String, nullable=True)
    bind_dn = Column(String, nullable=True)
    encrypted_bind_password = Column(Text, nullable=True)
    user_search_filter = Column(String, default="(sAMAccountName={username})")
    default_role = Column(String, default="operator")
    enabled = Column(Boolean, default=False)


class FlowRecord(Base):
    __tablename__ = "flow_records"
    id = Column(Integer, primary_key=True)
    device_id = Column(Integer, ForeignKey("devices.id"), index=True)
    src_ip = Column(String)
    dst_ip = Column(String)
    src_port = Column(Integer)
    dst_port = Column(Integer)
    protocol = Column(String)   # TCP/UDP/ICMP/GRE/OSPF
    bytes = Column(Integer)
    packets = Column(Integer)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        Index("ix_flowrecord_device_ts", "device_id", "timestamp"),
    )
