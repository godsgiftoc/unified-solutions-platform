"""Manages one persistent kernel subprocess per notebook.

Each notebook gets a long-lived Python process holding its variable state. Cell
runs are serialized per notebook via a lock; a wall-clock timeout kills and
recycles a runaway kernel.
"""

from __future__ import annotations

import atexit
import json
import os
import select
import subprocess
import sys
import threading
from pathlib import Path

_RUNNER = str(Path(__file__).with_name("_notebook_kernel.py"))
_TIMEOUT = 30

_kernels: dict[str, subprocess.Popen] = {}
_locks: dict[str, threading.Lock] = {}
_registry_lock = threading.Lock()


def _lock_for(notebook_id: str) -> threading.Lock:
    with _registry_lock:
        return _locks.setdefault(notebook_id, threading.Lock())


def _spawn() -> subprocess.Popen:
    return subprocess.Popen(
        [sys.executable, _RUNNER],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        bufsize=1,
        env={**os.environ, "MPLBACKEND": "Agg"},
    )


def _alive(p: subprocess.Popen | None) -> bool:
    return p is not None and p.poll() is None


def run(notebook_id: str, code: str, workspace_id: str | None = None) -> dict:
    command = json.dumps({"code": code, "workspace_id": workspace_id}) + "\n"
    with _lock_for(notebook_id):
        proc = _kernels.get(notebook_id)
        if not _alive(proc):
            proc = _spawn()
            _kernels[notebook_id] = proc
        try:
            proc.stdin.write(command)
            proc.stdin.flush()
        except (BrokenPipeError, ValueError):
            proc = _spawn()
            _kernels[notebook_id] = proc
            proc.stdin.write(command)
            proc.stdin.flush()

        ready, _, _ = select.select([proc.stdout], [], [], _TIMEOUT)
        if not ready:
            proc.kill()
            _kernels.pop(notebook_id, None)
            return {
                "stdout": "",
                "outputs": [
                    {"type": "error", "text": f"Timed out after {_TIMEOUT}s — kernel restarted"}
                ],
            }
        line = proc.stdout.readline()
        if not line:
            _kernels.pop(notebook_id, None)
            return {
                "stdout": "",
                "outputs": [{"type": "error", "text": "Kernel exited unexpectedly"}],
            }
        try:
            return json.loads(line)
        except json.JSONDecodeError:
            return {"stdout": line, "outputs": []}


def restart(notebook_id: str) -> None:
    with _lock_for(notebook_id):
        proc = _kernels.pop(notebook_id, None)
        if _alive(proc):
            proc.kill()


@atexit.register
def _cleanup() -> None:  # pragma: no cover
    for proc in _kernels.values():
        try:
            proc.kill()
        except Exception:
            pass
