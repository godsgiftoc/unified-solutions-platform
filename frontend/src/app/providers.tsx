"use client";

import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { ApiError } from "@/lib/api";
import { DialogProvider } from "@/lib/confirm";
import { ProjectProvider } from "@/lib/project";
import { ThemeProvider } from "@/lib/theme";
import { notify, ToastProvider } from "@/lib/toast";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
        // Surface any failed data fetch as an error toast (deduped by react-query).
        queryCache: new QueryCache({
          onError: (error) => {
            const msg = error instanceof ApiError ? error.message : "Something went wrong loading data";
            notify(msg, "error");
          },
        }),
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <ToastProvider>
          <DialogProvider>
            <ProjectProvider>{children}</ProjectProvider>
          </DialogProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
