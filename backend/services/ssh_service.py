import paramiko
import threading
import time
from typing import Optional, Callable


class SSHService:
    def connect(
        self,
        host: str,
        port: int = 22,
        username: str = "admin",
        password: Optional[str] = None,
        key_path: Optional[str] = None,
        timeout: int = 30,
    ) -> paramiko.SSHClient:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        kwargs = {
            "hostname": host,
            "port": port,
            "username": username,
            "timeout": timeout,
            "banner_timeout": 30,
        }
        if key_path:
            kwargs["key_filename"] = key_path
        elif password:
            kwargs["password"] = password
        client.connect(**kwargs)
        return client

    def run_command(self, client: paramiko.SSHClient, command: str) -> tuple[str, str]:
        stdin, stdout, stderr = client.exec_command(command, timeout=60)
        return (
            stdout.read().decode("utf-8", errors="replace"),
            stderr.read().decode("utf-8", errors="replace"),
        )

    def get_config(
        self, host: str, port: int, username: str, password: str, vendor: str
    ) -> tuple[Optional[str], Optional[str]]:
        commands = {
            "cisco": "terminal length 0\nshow running-config",
            "cisco-asa": "terminal pager 0\nshow running-config",
            "mikrotik": "/export compact",
            "fortinet": "show full-configuration",
            "hp": "terminal length 0\nshow running-config",
            "ubiquiti": "cat /tmp/system.cfg",
            "juniper": "set cli screen-length 0\nshow configuration",
            "paloalto": "set cli pager off\nshow config running",
            "checkpoint": "show configuration",
        }
        cmd = commands.get(vendor.lower(), "terminal length 0\nshow running-config")
        try:
            client = self.connect(host, port, username, password)
            # run each line as a separate command to handle multi-line setup
            output_parts = []
            for line in cmd.split("\n"):
                stdout, _ = self.run_command(client, line)
                output_parts.append(stdout)
            client.close()
            combined = "\n".join(output_parts).strip()
            return combined or None, None
        except Exception as e:
            return None, str(e)

    def open_interactive_channel(
        self,
        host: str,
        port: int,
        username: str,
        password: str,
        on_data: Callable[[str], None],
        key_path: Optional[str] = None,
    ):
        client = self.connect(host, port, username, password, key_path=key_path)
        channel = client.invoke_shell(term="xterm", width=220, height=50)

        def reader():
            while not channel.closed:
                if channel.recv_ready():
                    data = channel.recv(4096).decode("utf-8", errors="replace")
                    on_data(data)
                time.sleep(0.05)

        t = threading.Thread(target=reader, daemon=True)
        t.start()
        return client, channel
