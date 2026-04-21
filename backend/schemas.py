from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# --- Auth ---
class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: Optional[str] = None


class UserBase(BaseModel):
    username: str
    role: str = "operator"


class UserCreate(UserBase):
    password: str


class UserOut(UserBase):
    id: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# --- Device ---
class DeviceBase(BaseModel):
    hostname: str
    ip_address: str
    ssh_port: int = 22
    device_type: str
    vendor: str
    os_version: Optional[str] = None
    location: Optional[str] = None
    snmp_community: Optional[str] = None
    snmp_version: str = "v2c"
    vault_credential_id: Optional[int] = None


class DeviceCreate(DeviceBase):
    pass


class DeviceUpdate(DeviceBase):
    pass


class DeviceOut(DeviceBase):
    id: int
    status: str
    last_seen: Optional[datetime] = None
    last_backup: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


# --- Subnet ---
class SubnetBase(BaseModel):
    name: str
    cidr: str
    gateway: Optional[str] = None
    vlan_id: Optional[int] = None
    description: Optional[str] = None


class SubnetCreate(SubnetBase):
    pass


class SubnetOut(SubnetBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# --- IP Address ---
class IPAddressBase(BaseModel):
    address: str
    subnet_id: int
    hostname: Optional[str] = None
    mac_address: Optional[str] = None
    status: str = "free"
    description: Optional[str] = None


class IPAddressCreate(IPAddressBase):
    pass


class IPAddressOut(IPAddressBase):
    id: int

    class Config:
        from_attributes = True


# --- Vault ---
class VaultCredentialBase(BaseModel):
    name: str
    username: str
    tags: Optional[str] = None
    ssh_key_path: Optional[str] = None


class VaultCredentialCreate(VaultCredentialBase):
    password: str
    enable_pass: Optional[str] = None


class VaultCredentialOut(VaultCredentialBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# --- Alert ---
class AlertOut(BaseModel):
    id: int
    device_id: Optional[int]
    severity: str
    event_type: str
    message: str
    resolved: bool
    created_at: datetime

    class Config:
        from_attributes = True


class AlertCount(BaseModel):
    critical: int
    warning: int


# --- Backup ---
class BackupOut(BaseModel):
    id: int
    device_id: int
    filepath: str
    file_size: Optional[int]
    triggered_by: str
    created_at: datetime

    class Config:
        from_attributes = True


# --- Metric ---
class MetricOut(BaseModel):
    id: int
    device_id: int
    metric: str
    value: float
    timestamp: datetime

    class Config:
        from_attributes = True


# --- Inventory ---
class InventoryBase(BaseModel):
    name: str
    model: Optional[str] = None
    vendor: Optional[str] = None
    serial_number: Optional[str] = None
    quantity: int = 1
    device_type: Optional[str] = None
    location: Optional[str] = None
    purchase_date: Optional[datetime] = None
    eol_date: Optional[datetime] = None


class InventoryCreate(InventoryBase):
    pass


class InventoryOut(InventoryBase):
    id: int

    class Config:
        from_attributes = True


# --- License ---
class LicenseBase(BaseModel):
    name: str
    license_type: str
    vendor: str
    expiry_date: datetime
    notes: Optional[str] = None


class LicenseCreate(LicenseBase):
    pass


class LicenseOut(LicenseBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# --- File ---
class FileEntryOut(BaseModel):
    id: int
    name: str
    path: str
    size: int
    file_type: str
    folder: str
    uploaded_by: str
    created_at: datetime

    class Config:
        from_attributes = True


# --- Settings ---
class SettingOut(BaseModel):
    key: str
    value: str
    description: Optional[str] = None

    class Config:
        from_attributes = True


class SettingsUpdate(BaseModel):
    settings: dict


# --- Audit ---
class AuditLogOut(BaseModel):
    id: int
    user: str
    action: str
    target: str
    details: Optional[str]
    ip_address: Optional[str]
    timestamp: datetime

    class Config:
        from_attributes = True
