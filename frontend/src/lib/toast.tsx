"use client";

import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

type ToastType = "success" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  type: ToastType;
}
interface ToastApi {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastApi>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

// Module-level bridge so non-React code (e.g. the React Query error cache) can
// raise toasts without access to the context.
let externalToast: ((message: string, type?: ToastType) => void) | null = null;
export function notify(message: string, type: ToastType = "info") {
  externalToast?.(message, type);
}

let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback(
    (message: string, type: ToastType = "success") => {
      const id = ++counter;
      setToasts((t) => [...t.slice(-3), { id, message, type }]);
      setTimeout(() => dismiss(id), type === "error" ? 5000 : 3200);
    },
    [dismiss],
  );

  // Expose the toast fn to module-level callers (e.g. the query error cache).
  useEffect(() => {
    externalToast = toast;
    return () => {
      externalToast = null;
    };
  }, [toast]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col gap-2.5">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const STYLES: Record<ToastType, { icon: typeof Info; tint: string; ring: string }> = {
  success: { icon: CheckCircle2, tint: "text-emerald-600", ring: "border-l-emerald-500" },
  error: { icon: AlertTriangle, tint: "text-red-600", ring: "border-l-red-500" },
  info: { icon: Info, tint: "text-brand-600", ring: "border-l-brand-500" },
};

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const s = STYLES[toast.type];
  const Icon = s.icon;
  return (
    <div className={`pointer-events-auto flex items-start gap-3 rounded-xl border border-l-4 border-slate-200 bg-white px-4 py-3 shadow-lift animate-toast-in ${s.ring}`}>
      <Icon size={18} className={`mt-0.5 shrink-0 ${s.tint}`} />
      <p className="min-w-0 flex-1 text-sm font-medium text-slate-700">{toast.message}</p>
      <button onClick={onClose} className="shrink-0 rounded p-0.5 text-slate-300 transition hover:text-slate-600">
        <X size={15} />
      </button>
    </div>
  );
}
