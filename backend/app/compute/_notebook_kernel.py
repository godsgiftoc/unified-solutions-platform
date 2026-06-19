"""Persistent notebook kernel (one long-lived subprocess per notebook).

Reads one JSON command per line from stdin ({"code": "..."}), executes it in a
PERSISTENT namespace (so variables carry across cells like a real notebook), and
writes one JSON result line to stdout. User stdout is captured into the result,
so the stdout protocol channel stays clean.

`load_dataset(slug)` fetches data over the platform API (the data bridge) rather
than touching the DuckDB file directly.
"""

from __future__ import annotations

import ast
import base64
import contextlib
import importlib
import io
import json
import os
import shlex
import signal
import subprocess
import sys
import time
import traceback
import urllib.request

API = os.environ.get("USP_API_BASE", "http://localhost:8000/api/v1")


def load_dataset(slug: str, limit: int = 100000):
    import pandas as pd

    body = json.dumps({"sql": f'SELECT * FROM "{slug}"', "limit": limit}).encode()
    req = urllib.request.Request(
        f"{API}/queries/run", data=body, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310
            payload = json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        raise RuntimeError(
            f"Could not load dataset '{slug}': {exc.read().decode()[:200]}"
        ) from None
    return pd.DataFrame(payload["rows"], columns=payload["columns"])


# Set per-run from the kernel command so save helpers know where to write.
WORKSPACE_ID: str | None = None


def _post(path: str, payload: dict) -> dict:
    body = json.dumps(payload, default=str).encode()
    req = urllib.request.Request(
        f"{API}{path}", data=body, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=60) as resp:  # noqa: S310
        return json.loads(resp.read())


def _records(df):
    cleaned = df.astype(object).where(df.notna(), None)
    return [str(c) for c in df.columns], cleaned.values.tolist()


def save_dataset(df, name: str) -> str:
    """Persist a DataFrame as a queryable dataset. Returns its slug."""
    cols, rows = _records(df)
    ds = _post(
        "/datasets/from-records",
        {
            "workspace_id": WORKSPACE_ID,
            "name": name,
            "columns": cols,
            "rows": rows,
            "source": "notebook",
        },
    )
    print(f"✓ Saved dataset '{ds['name']}' ({ds['row_count']} rows) — query it as: {ds['slug']}")
    return ds["slug"]


def save_chart(df, name: str, kind: str = "bar", x: str | None = None, y: str | None = None) -> str:
    """Persist a DataFrame as a chart you can add to a dashboard. Returns chart id."""
    cols, _ = _records(df)
    slug = save_dataset(df, f"{name} (data)")
    x = x or cols[0]
    y = y or (cols[1] if len(cols) > 1 else cols[0])
    ch = _post(
        "/charts",
        {
            "workspace_id": WORKSPACE_ID,
            "name": name,
            "sql": f'SELECT * FROM "{slug}"',
            "viz_type": kind,
            "spec": {"x": x, "y": y},
        },
    )
    print(f"✓ Saved chart '{ch['name']}' ({kind}) — add it from the Dashboards page")
    return ch["id"]


def __usp_bang__(cmd: str) -> None:
    """Run a notebook shell command (e.g. `!pip install faker`). pip is routed
    through the kernel's own interpreter so installed packages are importable."""
    parts = shlex.split(cmd)
    if not parts:
        return
    if parts[0] in ("pip", "pip3"):
        parts = [sys.executable, "-m", "pip", *parts[1:]]
        proc = subprocess.run(parts, capture_output=True, text=True)
        importlib.invalidate_caches()  # make freshly-installed packages importable
    else:
        proc = subprocess.run(cmd, shell=True, capture_output=True, text=True)  # noqa: S602
    if proc.stdout:
        print(proc.stdout, end="")
    if proc.stderr:
        print(proc.stderr, end="")


def _preprocess(code: str) -> str:
    """Translate Jupyter/Colab-style `!shell` and `%magic` lines into plain Python
    so the cell parses. `%pip`/`!pip` install into the kernel; other magics are
    no-ops (e.g. `%matplotlib inline`)."""
    out: list[str] = []
    for ln in code.splitlines():
        stripped = ln.lstrip()
        indent = ln[: len(ln) - len(stripped)]
        if stripped.startswith("!") or (
            stripped.startswith("%") and stripped[1:].lstrip().startswith("pip")
        ):
            cmd = stripped.lstrip("!% ").replace('"""', '\\"\\"\\"')
            out.append(f'{indent}__usp_bang__(r"""{cmd}""")')
        elif stripped.startswith("%"):
            out.append(f"{indent}pass  # notebook magic ignored: {stripped}")
        else:
            out.append(ln)
    return "\n".join(out)


# Persistent namespace across cells.
G: dict = {
    "load_dataset": load_dataset,
    "save_dataset": save_dataset,
    "save_chart": save_chart,
    "__usp_bang__": __usp_bang__,
    "__name__": "__usp_notebook__",
}


class _StreamingIO(io.StringIO):
    """Captured stdout that ALSO streams live.

    Every `print` is (a) accumulated into a capped buffer that becomes the cell's
    persisted output, and (b) forwarded to the kernel's real stdout as framed
    `{"type":"stream","text":...}` lines so the UI can show output as it happens
    instead of only when the cell finishes.

    Two caps keep a runaway loop safe: the persisted copy stops growing at
    `_TOTAL_CAP` (memory bound), and at most `_CHUNK_CAP` chars are streamed per
    `_INTERVAL` window (so a tight `while True: print(...)` can't flood the pipe
    or the browser). Flushing is write-triggered — cells that print periodically
    stream smoothly; the remainder is flushed when the cell ends."""

    _TOTAL_CAP = 200_000
    _CHUNK_CAP = 16_000
    _INTERVAL = 0.08

    def __init__(self, sink) -> None:
        super().__init__()
        self._sink = sink  # the real stdout (protocol channel), captured pre-redirect
        self._pending: list[str] = []
        self._pending_len = 0
        self._persisted = 0
        self._last = time.monotonic()

    def write(self, s):  # type: ignore[override]
        if self._persisted < self._TOTAL_CAP:
            super().write(s[: self._TOTAL_CAP - self._persisted])
            self._persisted += len(s)
        if self._pending_len < self._CHUNK_CAP:
            self._pending.append(s[: self._CHUNK_CAP - self._pending_len])
            self._pending_len += len(s)
        if time.monotonic() - self._last >= self._INTERVAL:
            self.flush_stream()
        return len(s)

    def flush_stream(self) -> None:
        if self._pending:
            chunk = "".join(self._pending)
            self._pending = []
            self._pending_len = 0
            try:
                self._sink.write(json.dumps({"type": "stream", "text": chunk}) + "\n")
                self._sink.flush()
            except Exception:
                pass
        self._last = time.monotonic()


def run_one(code: str, sink) -> dict:
    outputs: list = []
    out = _StreamingIO(sink)
    display_value = None
    try:
        import matplotlib

        matplotlib.use("Agg")
        tree = ast.parse(_preprocess(code))
        last = tree.body[-1] if tree.body else None
        with contextlib.redirect_stdout(out):
            if isinstance(last, ast.Expr):
                exec(compile(ast.Module(tree.body[:-1], []), "<cell>", "exec"), G)  # noqa: S102
                display_value = eval(compile(ast.Expression(last.value), "<cell>", "eval"), G)  # noqa: S307
            else:
                exec(compile(tree, "<cell>", "exec"), G)  # noqa: S102
        out.flush_stream()  # push any output buffered since the last flush

        import matplotlib.pyplot as plt

        for num in plt.get_fignums():
            fig = plt.figure(num)
            buf = io.BytesIO()
            fig.savefig(buf, format="png", bbox_inches="tight", dpi=110)
            outputs.append({"type": "image", "data": base64.b64encode(buf.getvalue()).decode()})
        plt.close("all")

        import pandas as pd

        if isinstance(display_value, pd.DataFrame):
            df = display_value.head(200)
            outputs.append(
                {
                    "type": "table",
                    "columns": [str(c) for c in df.columns],
                    "rows": df.astype(object).where(df.notna(), None).values.tolist(),
                }
            )
        elif display_value is not None:
            outputs.append({"type": "result", "text": repr(display_value)})
    except KeyboardInterrupt:
        # User hit Stop (SIGINT). Surface Python's real KeyboardInterrupt traceback
        # (exactly like Jupyter/Colab) and keep the kernel + its state alive.
        out.flush_stream()
        outputs.append({"type": "error", "text": traceback.format_exc(limit=3)})
    except Exception:
        out.flush_stream()
        outputs.append({"type": "error", "text": traceback.format_exc(limit=3)})
    return {"type": "done", "stdout": out.getvalue(), "outputs": outputs}


def main() -> None:
    global WORKSPACE_ID
    # Restore the default SIGINT behaviour: when launched under a server (e.g.
    # uvicorn) the kernel can inherit an ignored/custom SIGINT disposition, which
    # would make the Stop button (proc SIGINT) a no-op. Forcing the default
    # handler guarantees an interrupt raises KeyboardInterrupt in the running cell.
    signal.signal(signal.SIGINT, signal.default_int_handler)
    while True:
        try:
            line = sys.stdin.readline()
        except KeyboardInterrupt:
            # A SIGINT that lands while the kernel is idle (between cells) must
            # not kill it — just ignore it and keep waiting for the next cell.
            continue
        if not line:
            break  # stdin closed → manager shut us down
        line = line.strip()
        if not line:
            continue
        try:
            cmd = json.loads(line)
        except json.JSONDecodeError:
            continue
        WORKSPACE_ID = cmd.get("workspace_id")
        # Pass the REAL stdout as the live-stream sink; user prints are captured
        # and forwarded through it as {"type":"stream"} frames during the run.
        # run_one returns the final {"type":"done", ...} frame on the same channel.
        result = run_one(cmd.get("code", ""), sys.stdout)
        sys.stdout.write(json.dumps(result, default=str) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
