"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { ApiError, Auth } from "@/lib/api";

/**
 * Gates the whole platform behind a real login: it loads /auth/me once and, on
 * a 401, redirects to /login (remembering where you were). The result is cached
 * under ["me"], so the nav and admin pages can read the current user without
 * re-fetching.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data, isLoading, error } = useQuery({
    queryKey: ["me"],
    queryFn: Auth.me,
    retry: false,
    staleTime: 60_000,
  });

  const unauthorized = error instanceof ApiError && error.status === 401;

  useEffect(() => {
    if (unauthorized) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [unauthorized, pathname, router]);

  if (isLoading || unauthorized || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#f7f9fc] to-[#eef2f8] dark:from-[#0a0a0a] dark:to-[#000000]">
        <Loader2 className="animate-spin text-brand-500" size={28} />
      </div>
    );
  }

  return <>{children}</>;
}
