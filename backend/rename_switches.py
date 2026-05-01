#!/usr/bin/env python3
"""
One-time migration: renames all switch-type devices → SW1, SW2, SW3 …
Run inside the backend container once:

  docker exec -it <backend-container-name> python rename_switches.py

The container name is usually:  nms-backend-1
"""
import sys
import os

# Make sure the backend modules are importable
sys.path.insert(0, os.path.dirname(__file__))

from database import SessionLocal
from models import Device

db = SessionLocal()
try:
    switches = (
        db.query(Device)
        .filter(Device.device_type == "switch")
        .order_by(Device.id)
        .all()
    )

    if not switches:
        print("No switch-type devices found. Nothing to rename.")
        sys.exit(0)

    print(f"Found {len(switches)} switch(es):\n")
    for i, dev in enumerate(switches, 1):
        old = dev.hostname
        dev.hostname = f"SW{i}"
        print(f"  [{dev.id}]  {old}  →  SW{i}")

    db.commit()
    print(f"\nDone. {len(switches)} device(s) renamed.")
finally:
    db.close()
