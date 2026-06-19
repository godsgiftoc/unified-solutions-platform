"""Manages persistent kernel subprocesses (one per notebook), built to scale.

Each notebook gets a long-lived Python process holding its variable state. To
stay healthy under many concurrent users:

* **Bounded fleet** — at most ``max_kernels`` processes exist at once; spawning
  past the cap evicts the least-recently-used *idle* kernel.
* **Idle reaping** — a background thread kills kernels idle longer than
  ``kernel_idle_timeout_s`` so abandoned notebooks don't pin memory forever.
* **Off the request threads** — ``run_stream_async`` executes the (blocking)
  kernel I/O in a *dedicated* bounded pool, never the request threadpool, so a
  flood of long/streaming cells can't starve login and other API calls. That
  pool's size (``max_concurrent_runs``) is also the backpressure limit.

Runs are serialized per notebook by a lock; ``interrupt`` stops a runaway
without taking that lock; a per-read timeout kills a truly stuck kernel.
"""

from __future__ import annotations

import atexit
import json
import os
import select
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path

from app.core.config import settings

_RUNNER = str(Path(__file__).with_name("_notebook_kernel.py"))

_kernels: dict[str, subprocess.Popen] = {}
_last_used: dict[str, float] = {}  # notebook_id -> monotonic time of last activity
_locks: dict[str, threading.Lock] = {}
_registry_lock = threading.Lock()

# Hard ceiling on concurrently *executing* cells. Protects the request threadpool
# from a burst of long/streaming runs — excess runs wait here. Pair with a raised
# anyio threadpool size (see main.py) so request handling keeps headroom.
_run_semaphore = threading.BoundedSemaphore(settings.max_concurrent_runs)

_reaper_started = False


def _lock_for(notebook_id: str) -> threading.Lock:
    with _registry_lock:
        return _locks.setdefault(notebook_id, threading.Lock())


def _running(notebook_id: str) -> bool:
    """True if a run currently holds this notebook's lock (so don't reap/evict it)."""
    lk = _locks.get(notebook_id)
    return lk is not None and lk.locked()


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


def _kill(proc: subprocess.Popen | None) -> None:
    if _alive(proc):
        try:
            proc.kill()
        except Exception:
            pass


def _evict_if_needed(current: str) -> None:
    """Under _registry_lock: if at the cap, kill the LRU *idle* kernel."""
    if len(_kernels) < settings.max_kernels:
        return
    candidates = sorted(
        (t, nid) for nid, t in _last_used.items() if nid != current and not _running(nid)
    )
    if not candidates:
        return  # everything is busy — soft-exceed the cap rather than block a user
    _, victim = candidates[0]
    _kill(_kernels.pop(victim, None))
    _last_used.pop(victim, None)


def _ensure_kernel(notebook_id: str) -> subprocess.Popen:
    _maybe_start_reaper()
    with _registry_lock:
        proc = _kernels.get(notebook_id)
        if _alive(proc):
            _last_used[notebook_id] = time.monotonic()
            return proc
        _evict_if_needed(notebook_id)
        proc = _spawn()
        _kernels[notebook_id] = proc
        _last_used[notebook_id] = time.monotonic()
        return proc


def _respawn(notebook_id: str) -> subprocess.Popen:
    with _registry_lock:
        _kill(_kernels.pop(notebook_id, None))
        proc = _spawn()
        _kernels[notebook_id] = proc
        _last_used[notebook_id] = time.monotonic()
        return proc


def _touch(notebook_id: str) -> None:
    with _registry_lock:
        if notebook_id in _kernels:
            _last_used[notebook_id] = time.monotonic()


def _maybe_start_reaper() -> None:
    global _reaper_started
    with _registry_lock:
        if _reaper_started:
            return
        _reaper_started = True
    threading.Thread(target=_reaper_loop, name="usp-kernel-reaper", daemon=True).start()


def _reaper_loop() -> None:  # pragma: no cover (timing-driven background thread)
    interval = max(30, settings.kernel_idle_timeout_s // 4)
    while True:
        time.sleep(interval)
        cutoff = time.monotonic() - settings.kernel_idle_timeout_s
        with _registry_lock:
            stale = [nid for nid, t in list(_last_used.items()) if t < cutoff and not _running(nid)]
            for nid in stale:
                _kill(_kernels.pop(nid, None))
                _last_used.pop(nid, None)


def run_stream(notebook_id: str, code: str, workspace_id: str | None = None):
    """Run a cell and yield the kernel's messages as they arrive.

    Yields zero or more ``{"type": "stream", "text": ...}`` frames (live stdout)
    followed by exactly one terminal ``{"type": "done", "stdout", "outputs"}``
    frame. The per-notebook lock is held for the whole run; interrupt() stops a
    runaway without the lock. The select timeout is a *per-read* idle backstop:
    a cell that keeps printing never trips it (it streams until stopped by hand),
    while a silent spinner (`while True: pass`) is killed after the timeout.
    """
    timeout = settings.kernel_run_timeout_s
    command = json.dumps({"code": code, "workspace_id": workspace_id}) + "\n"
    done = False
    proc = None
    _run_semaphore.acquire()  # cap concurrently executing cells
    try:
        with _lock_for(notebook_id):
            proc = _ensure_kernel(notebook_id)
            try:
                proc.stdin.write(command)
                proc.stdin.flush()
            except (BrokenPipeError, ValueError):
                proc = _respawn(notebook_id)
                proc.stdin.write(command)
                proc.stdin.flush()

            while True:
                ready, _, _ = select.select([proc.stdout], [], [], timeout)
                if not ready:
                    _kill(proc)
                    with _registry_lock:
                        _kernels.pop(notebook_id, None)
                        _last_used.pop(notebook_id, None)
                    done = True
                    yield {
                        "type": "done",
                        "stdout": "",
                        "outputs": [
                            {"type": "error", "text": f"Timed out after {timeout}s — kernel restarted"}
                        ],
                    }
                    return
                line = proc.stdout.readline()
                if not line:
                    with _registry_lock:
                        _kernels.pop(notebook_id, None)
                        _last_used.pop(notebook_id, None)
                    done = True
                    yield {
                        "type": "done",
                        "stdout": "",
                        "outputs": [{"type": "error", "text": "Kernel exited unexpectedly"}],
                    }
                    return
                try:
                    msg = json.loads(line)
                except json.JSONDecodeError:
                    continue
                yield msg
                if msg.get("type") == "done":
                    done = True
                    return
    finally:
        # Consumer went away before the cell finished → stop the runaway.
        if not done and _alive(proc):
            try:
                proc.send_signal(signal.SIGINT)
            except (ProcessLookupError, ValueError, OSError):
                pass
        _touch(notebook_id)
        _run_semaphore.release()


def run(notebook_id: str, code: str, workspace_id: str | None = None) -> dict:
    """Blocking convenience wrapper: drain run_stream() to the final result."""
    final = {"stdout": "", "outputs": []}
    for msg in run_stream(notebook_id, code, workspace_id):
        if msg.get("type") == "done":
            final = {"stdout": msg.get("stdout", ""), "outputs": msg.get("outputs", [])}
    return final


def interrupt(notebook_id: str) -> None:
    """Stop the cell currently running in a notebook's kernel without killing it.

    Sends SIGINT to the kernel subprocess, which raises KeyboardInterrupt inside
    the running cell; the kernel catches it, returns an "interrupted" output, and
    stays alive with its variable state intact. Deliberately does NOT take the
    per-notebook lock — a run holds that for the whole execution, so the interrupt
    has to reach the process while the run is still waiting on it.
    """
    with _registry_lock:
        proc = _kernels.get(notebook_id)
    if _alive(proc):
        try:
            proc.send_signal(signal.SIGINT)
        except (ProcessLookupError, ValueError, OSError):
            pass


def restart(notebook_id: str) -> None:
    with _lock_for(notebook_id):
        with _registry_lock:
            proc = _kernels.pop(notebook_id, None)
            _last_used.pop(notebook_id, None)
        _kill(proc)


@atexit.register
def _cleanup() -> None:  # pragma: no cover
    for proc in list(_kernels.values()):
        _kill(proc)
