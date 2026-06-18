import type { CellOutput, NotebookCell, NotebookDetail } from "@/lib/api";

/** Split into nbformat-style source lines (each keeps its trailing newline). */
function toLines(s: string): string[] {
  if (!s) return [];
  const lines = s.split(/(?<=\n)/);
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function toOutputs(outs: CellOutput[], execCount: number | null): any[] {
  const result: any[] = [];
  for (const o of outs ?? []) {
    if (o.type === "stdout") {
      result.push({ output_type: "stream", name: "stdout", text: toLines(o.text ?? "") });
    } else if (o.type === "result") {
      result.push({ output_type: "execute_result", data: { "text/plain": toLines(o.text ?? "") }, metadata: {}, execution_count: execCount });
    } else if (o.type === "image") {
      result.push({ output_type: "display_data", data: { "image/png": o.data ?? "" }, metadata: {} });
    } else if (o.type === "error") {
      result.push({ output_type: "error", ename: "Error", evalue: "", traceback: toLines(o.text ?? "") });
    } else if (o.type === "table") {
      const cols = o.columns ?? [];
      const rows = o.rows ?? [];
      const plain = [cols.join("\t"), ...rows.map((r) => r.map((c) => String(c ?? "")).join("\t"))].join("\n");
      const html =
        `<table border="1">\n<thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead>\n` +
        `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>\n</table>`;
      result.push({ output_type: "execute_result", data: { "text/plain": toLines(plain), "text/html": toLines(html) }, metadata: {}, execution_count: execCount });
    }
  }
  return result;
}

function toCell(cell: NotebookCell): any {
  if (cell.cell_type === "markdown") {
    return { cell_type: "markdown", metadata: {}, source: toLines(cell.source) };
  }
  return {
    cell_type: "code",
    metadata: {},
    execution_count: cell.execution_count ?? null,
    outputs: toOutputs(cell.outputs, cell.execution_count),
    source: toLines(cell.source),
  };
}

/** Build a standard Jupyter (nbformat v4) document from a notebook. */
export function notebookToIpynb(nb: NotebookDetail) {
  return {
    cells: nb.cells.map(toCell),
    metadata: {
      kernelspec: { display_name: "Python 3", language: "python", name: "python3" },
      language_info: { name: "python", version: "3.12" },
      usp: { name: nb.name },
    },
    nbformat: 4,
    nbformat_minor: 5,
  };
}

/** Trigger a client-side download of the notebook as a .ipynb file. */
export function downloadNotebook(nb: NotebookDetail) {
  const json = JSON.stringify(notebookToIpynb(nb), null, 1);
  const blob = new Blob([json], { type: "application/x-ipynb+json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(nb.name || "notebook").replace(/[^\w.-]+/g, "_")}.ipynb`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
