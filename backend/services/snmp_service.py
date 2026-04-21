import asyncio
from typing import Optional


# OIDs for common metrics
OID_CPU = "1.3.6.1.4.1.9.2.1.57.0"       # Cisco CPU 5-min avg
OID_MEM_USED = "1.3.6.1.4.1.9.9.48.1.1.1.5.1"
OID_MEM_FREE = "1.3.6.1.4.1.9.9.48.1.1.1.6.1"
OID_SYSUPTIME = "1.3.6.1.2.1.1.3.0"


async def snmp_get(host: str, community: str, oid: str, version: str = "v2c") -> Optional[float]:
    try:
        from pysnmp.hlapi.asyncio import (
            getCmd, SnmpEngine, CommunityData, UdpTransportTarget,
            ContextData, ObjectType, ObjectIdentity,
        )
        engine = SnmpEngine()
        community_data = CommunityData(community, mpModel=0 if version == "v1" else 1)
        transport = await UdpTransportTarget.create((host, 161), timeout=3, retries=1)
        error_indication, error_status, error_index, var_binds = await getCmd(
            engine,
            community_data,
            transport,
            ContextData(),
            ObjectType(ObjectIdentity(oid)),
        )
        if error_indication or error_status:
            return None
        for var_bind in var_binds:
            return float(var_bind[1])
    except Exception:
        return None


async def poll_device_metrics(host: str, community: str, version: str = "v2c") -> dict:
    if not community:
        return {}
    cpu = await snmp_get(host, community, OID_CPU, version)
    mem_used = await snmp_get(host, community, OID_MEM_USED, version)
    mem_free = await snmp_get(host, community, OID_MEM_FREE, version)

    metrics = {}
    if cpu is not None:
        metrics["cpu"] = cpu
    if mem_used is not None and mem_free is not None and (mem_used + mem_free) > 0:
        metrics["memory"] = round(mem_used / (mem_used + mem_free) * 100, 1)
    return metrics
