"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Lock, X, XCircle } from "lucide-react";
import { useState } from "react";

import {
  ApiError,
  Connections,
  Connectors,
  type Connection,
  type ConnectionTestResult,
  type ConnectorField,
} from "@/lib/api";
import { useToast } from "@/lib/toast";
import { ConnectorLogo } from "./ConnectorLogo";
import { CsvUpload } from "./CsvUpload";

type FieldValues = Record<string, string | boolean>;

export function ConnectionWizard({
  connectorType,
  workspaceId,
  onClose,
}: {
  connectorType: string;
  workspaceId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const detail = useQuery({
    queryKey: ["connector", connectorType],
    queryFn: () => Connectors.get(connectorType),
  });

  const [name, setName] = useState("");
  const [values, setValues] = useState<FieldValues>({});
  const [created, setCreated] = useState<Connection | null>(null);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);

  const create = useMutation({
    mutationFn: () => {
      const d = detail.data!;
      const config: Record<string, unknown> = {};
      const secrets: Record<string, string> = {};
      for (const f of d.fields) {
        const v = values[f.name];
        if (v === undefined || v === "") continue;
        if (f.secret) secrets[f.name] = String(v);
        else config[f.name] = v;
      }
      return Connections.create({
        type: connectorType,
        name: name || d.name,
        workspace_id: workspaceId,
        config,
        secrets,
      });
    },
    onSuccess: (conn) => {
      setCreated(conn);
      qc.invalidateQueries({ queryKey: ["connectors"] });
      qc.invalidateQueries({ queryKey: ["connections"] });
      toast("Connection saved");
    },
    onError: () => toast("Couldn't save the connection", "error"),
  });

  const test = useMutation({
    mutationFn: () => Connections.test(created!.id),
    onSuccess: (r) => { setTestResult(r); toast(r.ok ? "Connection test passed" : "Connection test failed", r.ok ? "success" : "error"); },
    onError: () => toast("Connection test failed", "error"),
  });

  const d = detail.data;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl bg-white shadow-lift ring-1 ring-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X size={18} />
        </button>

        {detail.isLoading && <p className="p-8 text-slate-400">Loading…</p>}

        {d && (
          <div className="p-7">
            <div className="mb-6 flex items-center gap-3.5">
              <ConnectorLogo type={d.type} size={48} />
              <div>
                <h2 className="text-lg font-bold text-brand-950">{d.name}</h2>
                <p className="text-sm text-slate-500">{d.description || d.subtitle}</p>
              </div>
            </div>

            {d.type === "csv_upload" ? (
              <CsvUpload workspaceId={workspaceId} onClose={onClose} />
            ) : !created ? (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  create.mutate();
                }}
              >
                <Field label="Connection name">
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm ring-focus"
                    placeholder={`My ${d.name} connection`}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>

                <div className="max-h-[46vh] space-y-4 overflow-y-auto pr-1">
                  {d.fields.map((f) => (
                    <DynamicField
                      key={f.name}
                      field={f}
                      value={values[f.name]}
                      allValues={values}
                      onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))}
                    />
                  ))}
                </div>

                {create.isError && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    {(create.error as ApiError).message}
                  </p>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <GhostBtn onClick={onClose}>Cancel</GhostBtn>
                  <PrimaryBtn type="submit" disabled={create.isPending}>
                    {create.isPending ? "Saving…" : "Save connection"}
                  </PrimaryBtn>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  <CheckCircle2 size={18} />
                  Connection <b className="mx-1">{created.name}</b> saved & secrets encrypted.
                </div>
                <p className="text-sm text-slate-500">
                  Run a connection test to confirm credentials, then it&apos;s ready to sync.
                </p>

                {testResult && (
                  <div
                    className={`flex items-start gap-2 rounded-lg px-4 py-3 text-sm ${
                      testResult.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
                    }`}
                  >
                    {testResult.ok ? (
                      <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
                    ) : (
                      <XCircle size={18} className="mt-0.5 shrink-0" />
                    )}
                    <span>{testResult.message}</span>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <GhostBtn onClick={onClose}>Done</GhostBtn>
                  <PrimaryBtn onClick={() => test.mutate()} disabled={test.isPending}>
                    {test.isPending ? "Testing…" : "Test connection"}
                  </PrimaryBtn>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function DynamicField({
  field,
  value,
  allValues,
  onChange,
}: {
  field: ConnectorField;
  value: string | boolean | undefined;
  allValues: FieldValues;
  onChange: (v: string | boolean) => void;
}) {
  if (field.depends_on) {
    for (const [dep, expected] of Object.entries(field.depends_on)) {
      if (String(allValues[dep] ?? "") !== expected) return null;
    }
  }

  const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm ring-focus";
  const common = {
    placeholder: field.placeholder ?? "",
    value: (value as string) ?? "",
    className: inputCls,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange(e.target.value),
  };

  let control: React.ReactNode;
  switch (field.type) {
    case "password":
      control = <input type="password" autoComplete="new-password" {...common} />;
      break;
    case "textarea":
    case "json":
      control = <textarea rows={4} {...common} className={`${inputCls} font-mono text-xs`} />;
      break;
    case "number":
      control = <input type="number" {...common} />;
      break;
    case "boolean":
      control = (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-brand-600"
        />
      );
      break;
    case "select":
      control = (
        <select {...common}>
          <option value="">Select…</option>
          {field.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
      break;
    case "file":
      control = (
        <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
          Drag &amp; drop a .csv / .xlsx file
          <input {...common} className={`${inputCls} mt-2`} placeholder="…or paste an upload id / URI" />
        </div>
      );
      break;
    default:
      control = <input type={field.type === "url" ? "url" : "text"} {...common} />;
  }

  return (
    <Field
      label={
        <span className="flex items-center gap-1.5">
          {field.label}
          {field.required && <span className="text-red-400">*</span>}
          {field.secret && (
            <span className="inline-flex items-center gap-1 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
              <Lock size={9} /> encrypted
            </span>
          )}
        </span>
      }
    >
      {control}
      {field.help_text && <small className="mt-1 block text-xs text-slate-400">{field.help_text}</small>}
    </Field>
  );
}

function PrimaryBtn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-50"
    />
  );
}
function GhostBtn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
    />
  );
}
