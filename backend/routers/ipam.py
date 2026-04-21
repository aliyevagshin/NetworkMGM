from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from auth import get_current_user
import models
import schemas
import ipaddress
import asyncio
import socket
import subprocess
import re
from services.ping_service import ping

router = APIRouter(prefix="/ipam", tags=["ipam"])


@router.get("/subnets", response_model=List[schemas.SubnetOut])
def list_subnets(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return db.query(models.Subnet).all()


@router.post("/subnets", response_model=schemas.SubnetOut)
def create_subnet(subnet: schemas.SubnetCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if db.query(models.Subnet).filter(models.Subnet.cidr == subnet.cidr).first():
        raise HTTPException(status_code=400, detail="CIDR already exists")
    db_subnet = models.Subnet(**subnet.model_dump())
    db.add(db_subnet)
    db.commit()
    db.refresh(db_subnet)
    return db_subnet


@router.put("/subnets/{subnet_id}", response_model=schemas.SubnetOut)
def update_subnet(subnet_id: int, updates: schemas.SubnetCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    subnet = db.query(models.Subnet).filter(models.Subnet.id == subnet_id).first()
    if not subnet:
        raise HTTPException(status_code=404, detail="Subnet not found")
    for k, v in updates.model_dump(exclude_unset=True).items():
        setattr(subnet, k, v)
    db.commit()
    db.refresh(subnet)
    return subnet


@router.delete("/subnets/{subnet_id}")
def delete_subnet(subnet_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    subnet = db.query(models.Subnet).filter(models.Subnet.id == subnet_id).first()
    if not subnet:
        raise HTTPException(status_code=404, detail="Subnet not found")
    db.delete(subnet)
    db.commit()
    return {"ok": True}


@router.get("/subnets/{subnet_id}/addresses", response_model=List[schemas.IPAddressOut])
def get_addresses(subnet_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return db.query(models.IPAddress).filter(models.IPAddress.subnet_id == subnet_id).all()


@router.post("/addresses", response_model=schemas.IPAddressOut)
def create_address(addr: schemas.IPAddressCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if db.query(models.IPAddress).filter(models.IPAddress.address == addr.address).first():
        raise HTTPException(status_code=400, detail="IP already exists")
    db_addr = models.IPAddress(**addr.model_dump())
    db.add(db_addr)
    db.commit()
    db.refresh(db_addr)
    return db_addr


@router.post("/scan/{subnet_id}")
async def scan_subnet(subnet_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    subnet = db.query(models.Subnet).filter(models.Subnet.id == subnet_id).first()
    if not subnet:
        raise HTTPException(status_code=404, detail="Subnet not found")

    try:
        network = ipaddress.ip_network(subnet.cidr, strict=False)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid CIDR")

    hosts = list(network.hosts())[:254]

    async def check(ip):
        result = await ping(str(ip), count=1)
        return str(ip), result["reachable"]

    tasks = [check(ip) for ip in hosts]
    results = await asyncio.gather(*tasks)

    def get_hostname(ip: str) -> str:
        try:
            return socket.gethostbyaddr(ip)[0]
        except Exception:
            return ""

    def get_mac(ip: str) -> str:
        try:
            result = subprocess.run(
                ["arp", "-n", ip], capture_output=True, text=True, timeout=3
            )
            m = re.search(r"(([0-9a-fA-F]{2}[:\-]){5}[0-9a-fA-F]{2})", result.stdout)
            if m:
                return m.group(1)
        except Exception:
            pass
        return ""

    discovered = []
    for ip_str, reachable in results:
        if reachable:
            hostname = get_hostname(ip_str)
            mac = get_mac(ip_str)
            existing = db.query(models.IPAddress).filter(models.IPAddress.address == ip_str).first()
            if not existing:
                db_ip = models.IPAddress(
                    address=ip_str,
                    subnet_id=subnet_id,
                    status="allocated",
                    description="Discovered by scan",
                    hostname=hostname or None,
                    mac_address=mac or None,
                )
                db.add(db_ip)
                discovered.append({"ip": ip_str, "hostname": hostname, "mac": mac})
            else:
                existing.status = "allocated"
                if hostname:
                    existing.hostname = hostname
                if mac:
                    existing.mac_address = mac
                discovered.append({"ip": ip_str, "hostname": hostname, "mac": mac})

    db.commit()
    return {"discovered": discovered, "total_scanned": len(hosts)}
