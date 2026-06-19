"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { useState } from "react";

import { Button, Field, Modal, inputClass } from "@/components/ui";
import { Charts, Datasets, type CellOutput } from "@/lib/api";
import { useToast } from "@/lib/toast";

// The chart types that bind to a simple {x, y} encoding (matches the SQL editor).
const VIZ = ["column", "bar", "line", "area", "pie", "scatter"];

/**
 * Turns a notebook table output into a reusable chart: it materializes the rows
 * as a dataset (so the chart has a real query to re-run), then creates a chart
 * pointing at it — the same {sql, encoding} shape the SQL editor produces.
 */
export function ChartFromTable({
  workspaceId,
  output,
  onClose,
}: {
  workspaceId: string;
  output: CellOutput;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const columns = output.columns ?? [];
  const rows = output.rows ?? [];

  const [name, setName] = useState("Notebook chart");
  const [viz, setViz] = useState("column");
  const [x, setX] = useState(columns[0] ?? "");
  const [y, setY] = useState(columns[1] ?? columns[0] ?? "");

  const create = useMutation({
    mutationFn: async () => {
      const ds = await Datasets.fromRecords(workspaceId, `${name} (data)`, columns, rows);
      return Charts.create({
        workspace_id: workspaceId,
        name: name.trim(),
        sql: `SELECT * FROM "${ds.slug}"`,
        viz_type: viz,
        spec: { x, y },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["charts"] });
      qc.invalidateQueries({ queryKey: ["datasets"] });
      toast("Chart created — open it from the Charts or Dashboards page");
      onClose();
    },
    onError: () => toast("Couldn't create the chart", "error"),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Create chart from table"
      description="Saves this result as a dataset, then builds a reusable chart you can drop on a dashboard."
      icon={BarChart3}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !name.trim() || columns.length === 0}>
            {create.isPending ? "Creating…" : "Create chart"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Chart name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Chart type">
          <select className={inputClass} value={viz} onChange={(e) => setViz(e.target.value)}>
            {VIZ.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={viz === "pie" ? "Label" : "X axis"}>
            <select className={inputClass} value={x} onChange={(e) => setX(e.target.value)}>
              {columns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label={viz === "pie" ? "Value" : "Y axis"}>
            <select className={inputClass} value={y} onChange={(e) => setY(e.target.value)}>
              {columns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="text-xs text-slate-400">{rows.length.toLocaleString()} rows · {columns.length} columns</p>
      </div>
    </Modal>
  );
}
