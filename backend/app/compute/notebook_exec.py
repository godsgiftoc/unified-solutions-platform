"""Run notebook code in a resource-limited subprocess (see _notebook_runner.py)."""

from __future__ import annotations

import json
import os
import resource
import subprocess
import sys
import tempfile
from pathlib import Path

_RUNNER = str(Path(__file__).with_name("_notebook_runner.py"))
CPU_SECONDS = 20
WALL_TIMEOUT = 30


def _limits() -> None:  # pragma: no cover - runs in child process
    # CPU-time cap. (We avoid RLIMIT_AS on macOS, where it breaks interpreter startup.)
    try:
        resource.setrlimit(resource.RLIMIT_CPU, (CPU_SECONDS, CPU_SECONDS))
    except Exception:
        pass


def run_code(code: str) -> dict:
    """Execute Python code, returning {'stdout': str, 'outputs': [...]}."""
    with tempfile.TemporaryDirectory() as d:
        code_path = os.path.join(d, "cell.py")
        out_path = os.path.join(d, "out.json")
        Path(code_path).write_text(code)
        env = {**os.environ, "MPLBACKEND": "Agg"}
        try:
            subprocess.run(
                [sys.executable, _RUNNER, code_path, out_path],
                timeout=WALL_TIMEOUT,
                cwd=d,
                env=env,
                capture_output=True,
                preexec_fn=_limits if os.name == "posix" else None,
            )
        except subprocess.TimeoutExpired:
            return {"stdout": "", "outputs": [{"type": "error", "text": f"Timed out after {WALL_TIMEOUT}s"}]}
        if os.path.exists(out_path):
            try:
                return json.loads(Path(out_path).read_text())
            except json.JSONDecodeError:
                pass
        return {"stdout": "", "outputs": [{"type": "error", "text": "No output produced"}]}
