import asyncio
import platform
import re


async def ping(host: str, count: int = 4) -> dict:
    """ICMP ping — returns rtt_ms, packet_loss."""
    system = platform.system().lower()
    if system == "windows":
        cmd = ["ping", "-n", str(count), host]
    else:
        cmd = ["ping", "-c", str(count), "-W", "2", host]

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=15)
        output = stdout.decode("utf-8", errors="replace")
        return _parse_ping(output, system)
    except Exception:
        return {"reachable": False, "rtt_ms": None, "packet_loss": 100.0}


def _parse_ping(output: str, system: str) -> dict:
    reachable = False
    rtt_ms = None
    packet_loss = 100.0

    if system == "windows":
        loss_match = re.search(r"\((\d+)%\s+loss\)", output)
        if loss_match:
            packet_loss = float(loss_match.group(1))
        rtt_match = re.search(r"Average = (\d+)ms", output)
        if rtt_match:
            rtt_ms = float(rtt_match.group(1))
            reachable = True
    else:
        loss_match = re.search(r"(\d+(?:\.\d+)?)% packet loss", output)
        if loss_match:
            packet_loss = float(loss_match.group(1))
        rtt_match = re.search(r"rtt min/avg/max/mdev = [\d.]+/([\d.]+)/", output)
        if rtt_match:
            rtt_ms = float(rtt_match.group(1))
            reachable = packet_loss < 100

    return {"reachable": reachable, "rtt_ms": rtt_ms, "packet_loss": packet_loss}
