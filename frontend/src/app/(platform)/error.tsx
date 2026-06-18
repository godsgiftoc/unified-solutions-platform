"use client";

import { RotateCcw } from "lucide-react";
import { useEffect } from "react";

export default function PlatformError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface to the console for debugging; a real deployment would send to Sentry.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-red-100 text-red-600">
        <RotateCcw size={26} />
      </div>
      <h1 className="mt-5 text-xl font-bold text-brand-950">This page hit an unexpected error</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        The view crashed while rendering. You can retry — if it keeps happening, the detail below helps with debugging.
      </p>
      {error?.message && (
        <code className="mt-3 max-w-lg overflow-auto rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">{error.message}</code>
      )}
      <button
        onClick={reset}
        className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
      >
        <RotateCcw size={15} /> Try again
      </button>
    </div>
  );
}
