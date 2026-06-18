"""Standalone notebook cell runner (executed in a subprocess, never imported).

Runs user Python with a `load_dataset(slug)` bridge that fetches data over the
platform API (so the subprocess never touches the DuckDB file directly — matching
the data-bridge design in the architecture plan). Captures stdout, the last
expression value, DataFrames, and matplotlib figures, and writes them as JSON.

Dev-grade isolation: subprocess + CPU-time limit + wall-clock timeout. Production
hardening uses the gVisor sandbox described in the plan.
"""

from __future__ import annotations

import ast
import base64
import contextlib
import io
import json
import os
import sys
import traceback
import urllib.request

API = os.environ.get("USP_API_BASE", "http://localhost:8000/api/v1")


def load_dataset(slug: str, limit: int = 100000):
    import pandas as pd

    body = json.dumps({"sql": f'SELECT * FROM "{slug}"', "limit": limit}).encode()
    req = urllib.request.Request(
        f"{API}/queries/run", data=body, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310 - internal API only
        payload = json.loads(resp.read())
    return pd.DataFrame(payload["rows"], columns=payload["columns"])


def main() -> None:
    code_path, out_path = sys.argv[1], sys.argv[2]
    with open(code_path) as fh:
        src = fh.read()

    outputs: list[dict] = []
    stdout = io.StringIO()
    display_value = None

    try:
        import matplotlib

        matplotlib.use("Agg")

        g: dict = {"load_dataset": load_dataset, "__name__": "__usp_notebook__"}
        tree = ast.parse(src)
        last = tree.body[-1] if tree.body else None

        with contextlib.redirect_stdout(stdout):
            if isinstance(last, ast.Expr):
                body = ast.Module(body=tree.body[:-1], type_ignores=[])
                exec(compile(body, "<cell>", "exec"), g)  # noqa: S102 - sandboxed runner
                display_value = eval(  # noqa: S307
                    compile(ast.Expression(last.value), "<cell>", "eval"), g
                )
            else:
                exec(compile(tree, "<cell>", "exec"), g)  # noqa: S102

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
    except Exception:
        outputs.append({"type": "error", "text": traceback.format_exc(limit=3)})

    with open(out_path, "w") as fh:
        fh.write(json.dumps({"stdout": stdout.getvalue(), "outputs": outputs}, default=str))


if __name__ == "__main__":
    main()
