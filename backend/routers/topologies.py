from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user
import models
import json
from datetime import datetime

router = APIRouter(prefix="/topologies", tags=["topologies"])


def _out(t):
    return {
        "id": t.id,
        "name": t.name,
        "data": t.data,
        "created_at": t.created_at,
        "updated_at": t.updated_at,
    }


@router.get("")
def list_topologies(db: Session = Depends(get_db), _=Depends(get_current_user)):
    rows = db.query(models.TopologyProject).order_by(models.TopologyProject.updated_at.desc()).all()
    return [{"id": r.id, "name": r.name, "created_at": r.created_at, "updated_at": r.updated_at} for r in rows]


@router.post("")
def create_topology(body: dict, db: Session = Depends(get_db), _=Depends(get_current_user)):
    t = models.TopologyProject(
        name=body.get("name", "New Topology"),
        data=json.dumps({"nodes": [], "edges": []}),
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return _out(t)


@router.get("/{topo_id}")
def get_topology(topo_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    t = db.query(models.TopologyProject).filter(models.TopologyProject.id == topo_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Topology not found")
    return _out(t)


@router.put("/{topo_id}")
def update_topology(topo_id: int, body: dict, db: Session = Depends(get_db), _=Depends(get_current_user)):
    t = db.query(models.TopologyProject).filter(models.TopologyProject.id == topo_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Topology not found")
    if "name" in body:
        t.name = body["name"]
    if "data" in body:
        raw = body["data"]
        t.data = raw if isinstance(raw, str) else json.dumps(raw)
    t.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(t)
    return _out(t)


@router.delete("/{topo_id}")
def delete_topology(topo_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    t = db.query(models.TopologyProject).filter(models.TopologyProject.id == topo_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Topology not found")
    db.delete(t)
    db.commit()
    return {"ok": True}
