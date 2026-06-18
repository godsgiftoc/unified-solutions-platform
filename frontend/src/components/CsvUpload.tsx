"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileSpreadsheet, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";

import { ApiError, Datasets, type Dataset } from "@/lib/api";
import { useToast } from "@/lib/toast";

export function CsvUpload({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [created, setCreated] = useState<Dataset | null>(null);

  const upload = useMutation({
    mutationFn: () => Datasets.upload(file!, workspaceId, name || file!.name.replace(/\.[^.]+$/, "")),
    onSuccess: (ds) => {
      setCreated(ds);
      qc.invalidateQueries({ queryKey: ["datasets"] });
      qc.invalidateQueries({ queryKey: ["connectors"] });
      toast(`Dataset “${ds.name}” created`);
    },
    onError: () => toast("Upload failed", "error"),
  });

  if (created) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 size={18} />
          Dataset <b className="mx-1">{created.name}</b> created — {created.row_count} rows, {created.column_count} columns.
        </div>
        <p className="text-sm text-slate-500">
          It&apos;s queryable in the SQL editor as <code className="font-semibold text-brand-700">{created.slug}</code>.
        </p>
        <div className="flex justify-end">
          <button onClick={onClose} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-700">Dataset name</span>
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm ring-focus"
          placeholder={file ? file.name.replace(/\.[^.]+$/, "") : "My dataset"}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.[0]) setFile(e.dataTransfer.files[0]);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
          dragging ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-slate-50 hover:border-brand-400"
        }`}
      >
        {file ? (
          <>
            <FileSpreadsheet size={30} className="text-brand-600" />
            <div className="mt-2 font-semibold text-brand-950">{file.name}</div>
            <div className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB · click to change</div>
          </>
        ) : (
          <>
            <UploadCloud size={30} className="text-slate-400" />
            <div className="mt-2 font-semibold text-slate-700">Drag &amp; drop a file here</div>
            <div className="text-xs text-slate-500">or click to browse — .csv, .xlsx, .xls</div>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
        />
      </div>

      {upload.isError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{(upload.error as ApiError).message}</p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
          Cancel
        </button>
        <button
          onClick={() => upload.mutate()}
          disabled={!file || upload.isPending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {upload.isPending ? "Uploading…" : "Upload & create dataset"}
        </button>
      </div>
    </div>
  );
}
