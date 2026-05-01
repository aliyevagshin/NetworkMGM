#!/usr/bin/env python3
"""
One-time migration: renames devices by type with a prefix+number pattern.
  switch  → SW1, SW2, SW3 …
  router  → R1,  R2,  R3  …

Run inside the backend container once:

  docker exec -it <backend-container-name> python rename_switches.py

The container name is usually:  nms-backend-1
"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from database import SessionLocal
from models import Device

RENAME_MAP = {
    "switch": "SW",
    "router": "R",
}

db = SessionLocal()
try:
    total = 0
    for device_type, prefix in RENAME_MAP.items():
        devices = (
            db.query(Device)
            .filter(Device.device_type == device_type)
            .order_by(Device.id)
            .all()
        )
        if not devices:
            print(f"No {device_type} devices found — skipping.")
            continue

        print(f"\n{device_type.capitalize()}s ({len(devices)}):")
        for i, dev in enumerate(devices, 1):
            old = dev.hostname
            dev.hostname = f"{prefix}{i}"
            print(f"  [{dev.id}]  {old}  →  {dev.hostname}")
        total += len(devices)

    db.commit()
    print(f"\nDone. {total} device(s) renamed.")
finally:
    db.close()
