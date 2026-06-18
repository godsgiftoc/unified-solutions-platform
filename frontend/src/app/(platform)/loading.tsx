import { Spinner } from "@/components/ui";

export default function PlatformLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-slate-400">
      <Spinner size={26} className="text-brand-500" />
    </div>
  );
}
