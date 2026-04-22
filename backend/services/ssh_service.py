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
        import re as _re

        v = vendor.lower()

        # Vendors where exec_command is reliable (no interactive pager)
        exec_commands = {
            "mikrotik": "/export compact",
            "ubiquiti": "cat /tmp/system.cfg",
        }

        # Vendors that need an interactive shell to disable paging first
        shell_sequences = {
            "cisco":     ["terminal length 0",   "show running-config"],
            "cisco-asa": ["terminal pager 0",    "show running-config"],
            "hp":        ["terminal length 0",   "show running-config"],
            "fortinet":  ["config global",       "show full-configuration"],
            "juniper":   ["set cli screen-length 0", "show configuration"],
            "paloalto":  ["set cli pager off",   "show config running"],
            "checkpoint":["show configuration"],
        }

        try:
            client = self.connect(host, port, username, password)

            if v in exec_commands:
                stdout, stderr = self.run_command(client, exec_commands[v])
                client.close()
                return stdout.strip() or None, stderr.strip() or None

            # Interactive shell approach
            cmds = shell_sequences.get(v, ["terminal length 0", "show running-config"])
            channel = client.invoke_shell(term="vt100", width=250, height=50)
            time.sleep(1.5)
            if channel.recv_ready():
                channel.recv(65535)  # drain banner/prompt

            for cmd in cmds:
                channel.send(cmd + "\n")
                time.sleep(0.5)

            # Read until prompt or timeout (30s)
            raw = b""
            deadline = time.time() + 30
            while time.time() < deadline:
                time.sleep(0.3)
                while channel.recv_ready():
                    raw += channel.recv(65535)
                # stop when we see a CLI prompt at the end
                tail = raw.decode("utf-8", errors="replace").rstrip()
                if tail.endswith("#") or tail.endswith(">"):
                    break

            client.close()

            decoded = raw.decode("utf-8", errors="replace")
            # strip ANSI escape codes
            decoded = _re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", decoded)
            # drop first line (command echo) and last line (prompt)
            lines = decoded.splitlines()
            if len(lines) > 2:
                lines = lines[1:-1]
            result = "\n".join(lines).strip()
            return result or None, None

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
