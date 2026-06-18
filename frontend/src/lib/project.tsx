"use client";

import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { Workspaces, type Workspace } from "./api";

interface ProjectCtx {
  projects: Workspace[];
  activeId: string | undefined;
  active: Workspace | undefined;
  setActiveId: (id: string) => void;
  isLoading: boolean;
}

const Ctx = createContext<ProjectCtx | null>(null);
const KEY = "usp.activeProject";

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const projects = useQuery({ queryKey: ["workspaces"], queryFn: Workspaces.list });
  const [activeId, setActiveIdState] = useState<string | undefined>(undefined);

  // Resolve active project from localStorage, falling back to the first.
  useEffect(() => {
    if (!projects.data?.length) return;
    const stored = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
    const valid = stored && projects.data.some((p) => p.id === stored) ? stored : projects.data[0].id;
    setActiveIdState(valid);
  }, [projects.data]);

  const setActiveId = (id: string) => {
    setActiveIdState(id);
    if (typeof window !== "undefined") localStorage.setItem(KEY, id);
  };

  const value = useMemo<ProjectCtx>(
    () => ({
      projects: projects.data ?? [],
      activeId,
      active: projects.data?.find((p) => p.id === activeId),
      setActiveId,
      isLoading: projects.isLoading,
    }),
    [projects.data, projects.isLoading, activeId],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProject(): ProjectCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useProject must be used within ProjectProvider");
  return ctx;
}
