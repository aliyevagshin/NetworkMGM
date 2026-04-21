"""
Seed script — populates sample data for demo.
Run: docker compose exec backend python seed.py
"""
import sys
import os

sys.path.insert(0, "/app")

from database import SessionLocal, engine
import models
from auth import hash_password
from services.crypto_service import CryptoService
from datetime import datetime, timedelta

models.Base.metadata.create_all(bind=engine)
db = SessionLocal()
crypto = CryptoService()


def seed():
    # Vault credentials
    if db.query(models.VaultCredential).count() == 0:
        creds = [
            models.VaultCredential(
                name="Cisco Routers",
                username="admin",
                encrypted_password=crypto.encrypt("cisco123"),
                encrypted_enable_pass=crypto.encrypt("enable123"),
                tags="SSH,Cisco",
            ),
            models.VaultCredential(
                name="MikroTik Switches",
                username="admin",
                encrypted_password=crypto.encrypt("mikrotik123"),
                tags="SSH,MikroTik",
            ),
            models.VaultCredential(
                name="Linux Servers",
                username="root",
                encrypted_password=crypto.encrypt("linux123"),
                tags="SSH,Server",
            ),
        ]
        db.add_all(creds)
        db.commit()
        print("✓ Vault credentials seeded")

    # Devices
    if db.query(models.Device).count() == 0:
        cred1 = db.query(models.VaultCredential).filter_by(name="Cisco Routers").first()
        cred2 = db.query(models.VaultCredential).filter_by(name="MikroTik Switches").first()
        devices = [
            models.Device(hostname="core-router-01", ip_address="10.0.0.1", device_type="router",
                vendor="cisco", os_version="IOS 15.7", location="DC-A Rack 1",
                status="online", snmp_community="public", vault_credential_id=cred1.id if cred1 else None,
                last_seen=datetime.utcnow()),
            models.Device(hostname="core-router-02", ip_address="10.0.0.2", device_type="router",
                vendor="cisco", os_version="IOS 15.7", location="DC-B Rack 1",
                status="online", snmp_community="public", vault_credential_id=cred1.id if cred1 else None,
                last_seen=datetime.utcnow()),
            models.Device(hostname="dist-sw-01", ip_address="10.0.1.1", device_type="switch",
                vendor="mikrotik", os_version="RouterOS 7.14", location="Floor 1",
                status="online", snmp_community="public", vault_credential_id=cred2.id if cred2 else None,
                last_seen=datetime.utcnow()),
            models.Device(hostname="dist-sw-02", ip_address="10.0.1.2", device_type="switch",
                vendor="mikrotik", os_version="RouterOS 7.14", location="Floor 2",
                status="warning", snmp_community="public", vault_credential_id=cred2.id if cred2 else None,
                last_seen=datetime.utcnow() - timedelta(minutes=5)),
            models.Device(hostname="fw-01", ip_address="10.0.0.254", device_type="firewall",
                vendor="fortinet", os_version="FortiOS 7.4", location="DC-A DMZ",
                status="online", snmp_community="public",
                last_seen=datetime.utcnow()),
            models.Device(hostname="web-server-01", ip_address="10.1.0.10", device_type="server",
                vendor="hp", os_version="Ubuntu 22.04", location="DC-A Rack 5",
                status="online",
                last_seen=datetime.utcnow()),
            models.Device(hostname="ap-floor1-01", ip_address="10.2.1.1", device_type="ap",
                vendor="ubiquiti", os_version="AOS 6.5", location="Floor 1",
                status="offline"),
        ]
        db.add_all(devices)
        db.commit()
        print("✓ Devices seeded")

    # Subnets
    if db.query(models.Subnet).count() == 0:
        subnets = [
            models.Subnet(name="Core Network", cidr="10.0.0.0/24", gateway="10.0.0.1", vlan_id=10, description="Core infrastructure"),
            models.Subnet(name="Distribution", cidr="10.0.1.0/24", gateway="10.0.1.1", vlan_id=20, description="Distribution switches"),
            models.Subnet(name="Servers", cidr="10.1.0.0/24", gateway="10.1.0.1", vlan_id=100, description="Server farm"),
            models.Subnet(name="WiFi Floor 1", cidr="10.2.1.0/24", gateway="10.2.1.1", vlan_id=200, description="Wireless users"),
        ]
        db.add_all(subnets)
        db.commit()
        print("✓ Subnets seeded")

    # Inventory
    if db.query(models.InventoryItem).count() == 0:
        items = [
            models.InventoryItem(name="Cisco ISR 4331", model="ISR4331/K9", vendor="Cisco",
                serial_number="FTX2343A001", quantity=2, device_type="router", location="DC-A"),
            models.InventoryItem(name="MikroTik CRS354", model="CRS354-48G", vendor="MikroTik",
                serial_number="HEX123456", quantity=4, device_type="switch", location="Multiple"),
            models.InventoryItem(name="FortiGate 100F", model="FG-100F", vendor="Fortinet",
                serial_number="FGT123456789", quantity=1, device_type="firewall", location="DC-A",
                eol_date=datetime(2027, 12, 31)),
            models.InventoryItem(name="UniFi AP Pro", model="U6-Pro", vendor="Ubiquiti",
                serial_number="UAPRO001", quantity=8, device_type="ap", location="Office"),
        ]
        db.add_all(items)
        db.commit()
        print("✓ Inventory seeded")

    # Licenses
    if db.query(models.License).count() == 0:
        licenses = [
            models.License(name="FortiGate UTM License", license_type="Security",
                vendor="Fortinet", expiry_date=datetime.utcnow() + timedelta(days=25),
                notes="Renew urgently"),
            models.License(name="Cisco SmartNet", license_type="Support",
                vendor="Cisco", expiry_date=datetime.utcnow() + timedelta(days=180),
                notes="Annual support contract"),
            models.License(name="SolarWinds NPM", license_type="Software",
                vendor="SolarWinds", expiry_date=datetime.utcnow() + timedelta(days=75),
                notes="Network monitoring"),
        ]
        db.add_all(licenses)
        db.commit()
        print("✓ Licenses seeded")

    # Sample metrics
    if db.query(models.MetricSample).count() == 0:
        import random
        devices = db.query(models.Device).all()
        now = datetime.utcnow()
        samples = []
        for d in devices:
            for i in range(20):
                ts = now - timedelta(minutes=i * 30)
                samples += [
                    models.MetricSample(device_id=d.id, metric="cpu", value=random.uniform(5, 85), timestamp=ts),
                    models.MetricSample(device_id=d.id, metric="memory", value=random.uniform(20, 90), timestamp=ts),
                    models.MetricSample(device_id=d.id, metric="rtt_ms", value=random.uniform(1, 30), timestamp=ts),
                    models.MetricSample(device_id=d.id, metric="packet_loss", value=random.uniform(0, 1), timestamp=ts),
                ]
        db.add_all(samples)
        db.commit()
        print("✓ Metrics seeded")

    # Alerts
    if db.query(models.Alert).count() == 0:
        sw2 = db.query(models.Device).filter_by(hostname="dist-sw-02").first()
        alerts = [
            models.Alert(device_id=sw2.id if sw2 else None, severity="warning",
                event_type="cpu_high", message="dist-sw-02: CPU at 76%"),
            models.Alert(severity="warning", event_type="license_expiry",
                message="FortiGate UTM License expires in 25 days"),
        ]
        db.add_all(alerts)
        db.commit()
        print("✓ Alerts seeded")

    print("\n✅ Seed complete. Login: admin / Admin1234!")


if __name__ == "__main__":
    seed()
    db.close()
