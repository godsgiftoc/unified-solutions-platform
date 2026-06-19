"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Lock, User } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { ApiError, Auth } from "@/lib/api";

export default function LoginPage() {
  // useSearchParams must sit under a Suspense boundary for `next build` to prerender.
  return (
    <Suspense fallback={<div className="min-h-screen bg-brand-950" />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const next = params.get("next") || "/marketplace";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const login = useMutation({
    mutationFn: () => Auth.login(username.trim(), password),
    onSuccess: (me) => {
      qc.setQueryData(["me"], me);
      router.replace(next.startsWith("/login") ? "/marketplace" : next);
    },
    onError: (e) =>
      setError(e instanceof ApiError && e.status === 401 ? "Invalid username or password." : "Couldn't sign in. Try again."),
  });

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-950 px-4 text-white">
      <div className="orb -left-20 -top-24 h-96 w-96 bg-brand-600/40" />
      <div className="orb right-0 bottom-0 h-96 w-96 bg-azure/30" />
      <div className="absolute inset-0 bg-grid opacity-60" />

      <div className="relative w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-azure to-brand-500 text-xl font-black">
            U
          </span>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">Unified Solutions Platform</h1>
            <p className="mt-1 text-sm text-brand-100/70">Sign in to continue</p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (username.trim() && password) login.mutate();
          }}
          className="space-y-4 rounded-2xl bg-white p-6 text-slate-800 shadow-lift ring-1 ring-white/10 dark:bg-[#161616] dark:text-slate-100"
        >
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Username</span>
            <div className="relative">
              <User size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm shadow-sm ring-focus dark:border-white/15 dark:bg-white/5"
                placeholder="your username"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Password</span>
            <div className="relative">
              <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm shadow-sm ring-focus dark:border-white/15 dark:bg-white/5"
                placeholder="••••••••"
              />
            </div>
          </label>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}

          <button
            type="submit"
            disabled={login.isPending || !username.trim() || !password}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-azure to-brand-500 px-5 py-2.5 font-semibold text-white shadow-glow transition hover:opacity-95 disabled:opacity-60"
          >
            {login.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
            {login.isPending ? "Signing in…" : "Sign in"}
          </button>

          <p className="text-center text-xs text-slate-400">
            No account? Ask your administrator to create one for you.
          </p>
        </form>
      </div>
    </div>
  );
}
