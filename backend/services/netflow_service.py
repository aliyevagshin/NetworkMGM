"""
NetFlow v5 collector + traffic simulator.

Real NetFlow: devices export UDP datagrams to port 2055.
Simulation: background task generates realistic flows every 60s
            for all router/firewall devices (graceful fallback).
"""
import asyncio
import struct
import socket
import random
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

NETFLOW_UDP_PORT = 2055

_PROTO_MAP = {1: "ICMP", 6: "TCP", 17: "UDP", 47: "GRE", 89: "OSPF"}

_SVC_PORTS = {
    "TCP": [80, 443, 22, 25, 110, 143, 3389, 8080, 8443, 3306, 5432, 6379],
    "UDP": [53, 123, 161, 514, 500, 4500, 1194],
    "ICMP": [0],
    "GRE": [0],
}

_PRIVATE = ["10.0.0.", "10.1.0.", "10.10.0.", "192.168.1.", "192.168.10.",
            "172.16.0.", "172.16.1.", "10.0.1."]
_PUBLIC = ["8.8.", "1.1.", "104.16.", "185.228.", "151.101.",
           "93.184.216.", "172.217.", "52.84."]

_state: dict = {"transport": None, "tasks": []}


def _rand_ip(prefix: str) -> str:
    parts = prefix.rstrip(".").split(".")
    while len(parts) < 4:
        parts.append(str(random.randint(1, 254)))
    return ".".join(parts)


def generate_simulated_flows(count: int = 8) -> list[dict]:
    flows = []
    for _ in range(count):
        proto = random.choices(
            ["TCP", "TCP", "UDP", "ICMP", "GRE"],
            weights=[6, 6, 3, 2, 1],
        )[0]

        dst_port = random.choice(_SVC_PORTS.get(proto, [0]))
        src_port = random.randint(1024, 65535) if proto not in ("ICMP", "GRE") else 0

        r = random.random()
        if r < 0.40:
            src_ip = _rand_ip(random.choice(_PRIVATE))
            dst_ip = _rand_ip(random.choice(_PUBLIC))
        elif r < 0.70:
            src_ip = _rand_ip(random.choice(_PUBLIC))
            dst_ip = _rand_ip(random.choice(_PRIVATE))
        else:
            src_ip = _rand_ip(random.choice(_PRIVATE))
            dst_ip = _rand_ip(random.choice(_PRIVATE))

        pkt_count = random.randint(5, 10000)
        avg_size = random.randint(64, 1460)

        flows.append({
            "src_ip": src_ip,
            "dst_ip": dst_ip,
            "src_port": src_port,
            "dst_port": dst_port,
            "protocol": proto,
            "bytes": pkt_count * avg_size,
            "packets": pkt_count,
        })
    return flows


def _parse_netflow_v5(data: bytes) -> list[dict]:
    if len(data) < 24:
        return []
    version, count = struct.unpack("!HH", data[:4])
    if version != 5 or count == 0:
        return []
    flows = []
    for i in range(min(count, 30)):
        off = 24 + i * 48
        if off + 48 > len(data):
            break
        rec = struct.unpack("!IIIHHIIIIHHBBBBHHBB", data[off : off + 48])
        flows.append({
            "src_ip": socket.inet_ntoa(struct.pack("!I", rec[0])),
            "dst_ip": socket.inet_ntoa(struct.pack("!I", rec[1])),
            "src_port": rec[9],
            "dst_port": rec[10],
            "protocol": _PROTO_MAP.get(rec[12], f"proto-{rec[12]}"),
            "bytes": rec[6],
            "packets": rec[5],
        })
    return flows


class _NetFlowProtocol(asyncio.DatagramProtocol):
    def __init__(self, queue: asyncio.Queue):
        self._q = queue

    def datagram_received(self, data: bytes, addr):
        flows = _parse_netflow_v5(data)
        if flows:
            try:
                self._q.put_nowait((addr[0], flows))
            except asyncio.QueueFull:
                pass

    def error_received(self, exc):
        logger.warning("NetFlow UDP error: %s", exc)


async def _flow_consumer(queue: asyncio.Queue, db_factory):
    import models
    while True:
        try:
            src_ip, flows = await asyncio.wait_for(queue.get(), timeout=10.0)
        except asyncio.TimeoutError:
            continue
        except asyncio.CancelledError:
            break
        db = db_factory()
        try:
            device = (
                db.query(models.Device)
                .filter(
                    models.Device.ip_address == src_ip,
                    models.Device.device_type.in_(["router", "firewall"]),
                )
                .first()
            )
            if device:
                for f in flows:
                    db.add(models.FlowRecord(device_id=device.id, **f))
                db.commit()
        except Exception as e:
            logger.error("NetFlow consumer DB error: %s", e)
        finally:
            db.close()


async def _flow_simulator(db_factory):
    import models
    while True:
        try:
            await asyncio.sleep(60)
            db = db_factory()
            try:
                devices = (
                    db.query(models.Device)
                    .filter(models.Device.device_type.in_(["router", "firewall"]))
                    .all()
                )
                cutoff = datetime.utcnow() - timedelta(hours=24)
                db.query(models.FlowRecord).filter(
                    models.FlowRecord.timestamp < cutoff
                ).delete(synchronize_session=False)
                for dev in devices:
                    for f in generate_simulated_flows(count=random.randint(5, 12)):
                        db.add(models.FlowRecord(device_id=dev.id, **f))
                db.commit()
            finally:
                db.close()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("NetFlow simulator error: %s", e)


async def start(db_factory):
    """Start UDP collector (port 2055) and background simulator."""
    queue: asyncio.Queue = asyncio.Queue(maxsize=2000)
    loop = asyncio.get_event_loop()

    try:
        transport, _ = await loop.create_datagram_endpoint(
            lambda: _NetFlowProtocol(queue),
            local_addr=("0.0.0.0", NETFLOW_UDP_PORT),
        )
        _state["transport"] = transport
        logger.info("NetFlow UDP collector listening on port %d", NETFLOW_UDP_PORT)
    except Exception as e:
        logger.warning(
            "NetFlow UDP listener unavailable (port %d): %s — simulation only",
            NETFLOW_UDP_PORT, e,
        )

    _state["tasks"] = [
        asyncio.create_task(_flow_consumer(queue, db_factory)),
        asyncio.create_task(_flow_simulator(db_factory)),
    ]


async def stop():
    """Cancel background tasks and close UDP socket."""
    for t in _state["tasks"]:
        t.cancel()
    if _state["transport"]:
        _state["transport"].close()
