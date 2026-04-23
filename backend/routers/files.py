import os
import shutil
import aiofiles
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
from auth import get_current_user
import models
import schemas

router = APIRouter(prefix="/files", tags=["files"])

FILES_DIR = os.environ.get("FILES_DIR", "/app/files")
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
ALLOWED_EXTENSIONS = {
    ".txt", ".cfg", ".conf", ".log", ".csv", ".json", ".xml",
    ".yaml", ".yml", ".sh", ".py", ".pdf", ".zip", ".tar", ".gz",
}


@router.get("/folders")
def list_folders(folder: str = Query("/"), current_user=Depends(get_current_user)):
    """List immediate subdirectories of the given folder."""
    folder_path = os.path.join(FILES_DIR, folder.lstrip("/"))
    subfolders = []
    if os.path.exists(folder_path):
        try:
            for item in os.scandir(folder_path):
                if item.is_dir():
                    path = (folder.rstrip("/") + "/" + item.name)
                    subfolders.append({"name": item.name, "path": path})
        except PermissionError:
            pass
    return subfolders


@router.get("", response_model=List[schemas.FileEntryOut])
def list_files(folder: str = Query("/"), db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return db.query(models.FileEntry).filter(models.FileEntry.folder == folder).all()


@router.post("/upload")
async def upload_file(
    folder: str = Query("/"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type {ext} not allowed")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 50MB limit")

    folder_path = os.path.join(FILES_DIR, folder.lstrip("/"))
    os.makedirs(folder_path, exist_ok=True)
    filepath = os.path.join(folder_path, file.filename)

    async with aiofiles.open(filepath, "wb") as f:
        await f.write(content)

    entry = models.FileEntry(
        name=file.filename,
        path=filepath,
        size=len(content),
        file_type=ext.lstrip("."),
        folder=folder,
        uploaded_by=current_user.username,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.get("/{file_id}/download")
def download_file(file_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    entry = db.query(models.FileEntry).filter(models.FileEntry.id == file_id).first()
    if not entry or not os.path.exists(entry.path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(entry.path, filename=entry.name)


@router.delete("/{file_id}")
def delete_file(file_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    entry = db.query(models.FileEntry).filter(models.FileEntry.id == file_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="File not found")
    if os.path.exists(entry.path):
        os.remove(entry.path)
    db.delete(entry)
    db.commit()
    return {"ok": True}


@router.post("/folder")
def create_folder(folder: str = Query(...), db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    folder_path = os.path.join(FILES_DIR, folder.lstrip("/"))
    os.makedirs(folder_path, exist_ok=True)
    return {"folder": folder, "created": True}


@router.delete("/folder")
def delete_folder(folder: str = Query(...), db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Delete a folder and all its contents (files in DB + filesystem)."""
    if folder in ("/", ""):
        raise HTTPException(status_code=400, detail="Cannot delete root folder")

    folder_path = os.path.join(FILES_DIR, folder.lstrip("/"))

    # Prevent path traversal
    real_path = os.path.realpath(folder_path)
    real_base = os.path.realpath(FILES_DIR)
    if not real_path.startswith(real_base + os.sep):
        raise HTTPException(status_code=400, detail="Invalid folder path")

    # Delete all DB entries whose folder starts with this path
    all_entries = db.query(models.FileEntry).all()
    for entry in all_entries:
        if entry.folder == folder or entry.folder.startswith(folder.rstrip("/") + "/"):
            db.delete(entry)

    # Delete directory from filesystem
    if os.path.exists(folder_path):
        shutil.rmtree(folder_path, ignore_errors=True)

    db.commit()
    return {"ok": True, "folder": folder}
