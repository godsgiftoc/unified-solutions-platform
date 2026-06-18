import { Suspense } from "react";

import { SqlEditor } from "@/components/sql/SqlEditor";

export default function SqlPage() {
  return (
    <Suspense fallback={<p className="text-slate-400">Loading…</p>}>
      <SqlEditor />
    </Suspense>
  );
}
