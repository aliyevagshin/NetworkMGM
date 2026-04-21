import os
import aiofiles
from datetime import datetime
from services.ssh_service import SSHService

BACKUP_DIR = os.environ.get("BACKUP_DIR", "/app/backups")
ssh_service = SSHService()


async def pull_and_save_config(
    device,
    username: str,
    password: str,
    triggered_by: str = "manual",
) -> dict:
    """Pull config from device and write to disk. Returns backup metadata."""
    os.makedirs(BACKUP_DIR, exist_ok=True)
    config = ssh_service.get_config(
        host=device.ip_address,
        port=device.ssh_port,
        username=username,
        password=password,
        vendor=device.vendor or "cisco",
    )
    if not config:
        return {"success": False, "error": "SSH connection or command failed"}

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"{device.hostname}_{timestamp}.cfg"
    filepath = os.path.join(BACKUP_DIR, filename)

    async with aiofiles.open(filepath, "w") as f:
        await f.write(config)

    return {
        "success": True,
        "filepath": filepath,
        "file_size": len(config.encode()),
        "triggered_by": triggered_by,
    }
