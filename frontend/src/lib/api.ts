// Tiny typed fetch wrapper. Cookies are sent (same-origin via Vite proxy in dev).

const BASE = "/api/v1";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

// ---- Domain types ----
export type ConnectorBadge = "CONNECTED" | "BETA" | "AVAILABLE" | "COMING SOON";

export interface ConnectorCard {
  type: string;
  name: string;
  subtitle: string;
  icon: string;
  category: string;
  badge: ConnectorBadge;
  connection_count: number;
}

export interface Workspace {
  id: string;
  slug: string;
  name: string;
  role: string | null;
}

export interface ConnectorField {
  name: string;
  label: string;
  type: "string" | "password" | "textarea" | "number" | "boolean" | "select" | "multiselect" | "file" | "json" | "url";
  secret: boolean;
  required: boolean;
  help_text?: string | null;
  placeholder?: string | null;
  options?: string[] | null;
  depends_on?: Record<string, string> | null;
}

export interface ConnectorDetail {
  type: string;
  name: string;
  kind: "native" | "config";
  category: string;
  maturity: string;
  icon: string;
  subtitle: string;
  description: string;
  fields: ConnectorField[];
  supports_incremental: boolean;
  supports_schema_discovery: boolean;
}

export interface Connection {
  id: string;
  type: string;
  name: string;
  slug: string;
  workspace_id: string;
  config: Record<string, unknown>;
  status: string;
  schedule_cron: string | null;
  sync_mode: string;
  freshness_status: string;
  last_succeeded_at: string | null;
  created_at: string;
  secret_fields: Record<string, boolean>;
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
  details?: Record<string, unknown> | null;
}

export interface CreateConnectionInput {
  type: string;
  name: string;
  workspace_id: string;
  config: Record<string, unknown>;
  secrets: Record<string, string>;
  schedule_cron?: string | null;
  sync_mode?: string;
}

export const Connectors = {
  list: (workspaceId?: string) =>
    api.get<ConnectorCard[]>(
      `/connectors${workspaceId ? `?workspace_id=${workspaceId}` : ""}`,
    ),
  get: (type: string) => api.get<ConnectorDetail>(`/connectors/${type}`),
};

export const Connections = {
  list: (workspaceId?: string) =>
    api.get<Connection[]>(
      `/connections${workspaceId ? `?workspace_id=${workspaceId}` : ""}`,
    ),
  create: (input: CreateConnectionInput) => api.post<Connection>("/connections", input),
  test: (id: string) => api.post<ConnectionTestResult>(`/connections/${id}/test`),
};

export const Workspaces = {
  list: () => api.get<Workspace[]>("/workspaces"),
  create: (name: string, description?: string) =>
    api.post<Workspace>("/workspaces", { name, description }),
};

export const Auth = {
  devLogin: (email: string) => api.post("/auth/dev-login", { email }),
};

// ---- Datasets / Compute ----
export interface Dataset {
  id: string;
  workspace_id: string;
  slug: string;
  name: string;
  kind: string;
  catalog: string;
  schema_name: string;
  full_name: string;
  row_count: number | null;
  column_count: number;
  created_at: string;
}
export interface DatasetColumn {
  name: string;
  type: string;
}
export interface DatasetDetail extends Dataset {
  columns: DatasetColumn[];
}
export interface QueryResult {
  columns: string[];
  rows: (string | number | boolean | null)[][];
  row_count: number;
  truncated: boolean;
}
export interface Chart {
  id: string;
  workspace_id: string;
  name: string;
  viz_type: string;
  sql: string;
  spec: Record<string, unknown>;
  created_at: string;
}
export interface DashboardSummary {
  id: string;
  workspace_id: string;
  slug: string;
  title: string;
  description: string | null;
  status: string;
  version: number;
  tile_count: number;
  viz_types: string[];
  updated_at: string;
}
export interface DashboardTile {
  id: string;
  chart_id: string | null;
  title: string | null;
  layout: { x?: number; y?: number; w?: number; h?: number };
  viz_type: string | null;
  sql: string | null;
  encoding: Record<string, unknown> | null;
}
export interface DashboardDetail extends DashboardSummary {
  tiles: DashboardTile[];
}
export interface MarketplaceItem {
  id: string;
  title: string;
  description: string | null;
  owner_name: string | null;
  workspace_id: string;
  workspace_name: string | null;
  workspace_description: string | null;
  tile_count: number;
  viz_types: string[];
  updated_at: string;
}

async function uploadFile<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`/api/v1${path}`, { method: "POST", credentials: "include", body: form });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export const Datasets = {
  list: (ws?: string) => api.get<Dataset[]>(`/datasets${ws ? `?workspace_id=${ws}` : ""}`),
  get: (id: string) => api.get<DatasetDetail>(`/datasets/${id}`),
  preview: (id: string, limit = 50) => api.get<QueryResult>(`/datasets/${id}/preview?limit=${limit}`),
  upload: (file: File, workspaceId: string, name?: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("workspace_id", workspaceId);
    if (name) form.append("name", name);
    return uploadFile<Dataset>("/datasets/upload", form);
  },
  createSql: (workspaceId: string, name: string, sql: string) =>
    api.post<Dataset>("/datasets", { workspace_id: workspaceId, name, sql }),
  remove: (id: string) => api.del<void>(`/datasets/${id}`),
};

export interface SavedQuery {
  id: string;
  workspace_id: string;
  name: string;
  sql: string;
  created_at: string;
}

export const Queries = {
  run: (sql: string, limit = 1000) => api.post<QueryResult>("/queries/run", { sql, limit }),
  list: (ws?: string) => api.get<SavedQuery[]>(`/queries${ws ? `?workspace_id=${ws}` : ""}`),
  save: (workspaceId: string, name: string, sql: string) =>
    api.post<SavedQuery>("/queries", { workspace_id: workspaceId, name, sql }),
};

export const Charts = {
  list: (ws?: string) => api.get<Chart[]>(`/charts${ws ? `?workspace_id=${ws}` : ""}`),
  create: (input: {
    workspace_id: string;
    name: string;
    sql: string;
    viz_type: string;
    spec: Record<string, unknown>;
  }) => api.post<Chart>("/charts", input),
  data: (id: string) => api.post<QueryResult>(`/charts/${id}/data`),
  get: (id: string) => api.get<Chart>(`/charts/${id}`),
  update: (id: string, patch: { name?: string; viz_type?: string; sql?: string; spec?: Record<string, unknown> }) =>
    api.patch<Chart>(`/charts/${id}`, patch),
  remove: (id: string) => api.del<void>(`/charts/${id}`),
};

export const Dashboards = {
  list: (ws?: string) => api.get<DashboardSummary[]>(`/dashboards${ws ? `?workspace_id=${ws}` : ""}`),
  create: (workspaceId: string, title: string, description?: string) =>
    api.post<DashboardSummary>("/dashboards", { workspace_id: workspaceId, title, description }),
  get: (id: string) => api.get<DashboardDetail>(`/dashboards/${id}`),
  update: (id: string, patch: Record<string, unknown>) =>
    api.patch<DashboardSummary>(`/dashboards/${id}`, patch),
  addTile: (id: string, chartId: string) =>
    api.post<DashboardTile>(`/dashboards/${id}/tiles`, { chart_id: chartId }),
  deleteTile: (id: string, tileId: string) => api.del<void>(`/dashboards/${id}/tiles/${tileId}`),
  saveLayout: (id: string, items: { id: string; layout: object }[]) =>
    api.put<DashboardSummary>(`/dashboards/${id}/layout`, items),
  remove: (id: string) => api.del<void>(`/dashboards/${id}`),
  getShare: (id: string) => api.get<ShareLink | null>(`/dashboards/${id}/share`),
  createShare: (id: string) => api.post<ShareLink>(`/dashboards/${id}/share`, {}),
  revokeShare: (id: string) => api.del<void>(`/dashboards/${id}/share`),
};

export interface ShareLink {
  token: string;
  url_path: string;
}

export interface PublicTile {
  id: string;
  title: string | null;
  viz_type: string | null;
  encoding: Record<string, unknown> | null;
  layout: { x?: number; y?: number; w?: number; h?: number };
  data: QueryResult | null;
}
export interface PublicDashboard {
  title: string;
  description: string | null;
  tiles: PublicTile[];
}

export const Public = {
  dashboard: (token: string) => api.get<PublicDashboard>(`/public/dashboards/${token}`),
};

export const Marketplace = {
  list: (search?: string) =>
    api.get<MarketplaceItem[]>(`/marketplace${search ? `?search=${encodeURIComponent(search)}` : ""}`),
};

// ---- Notebooks ----
export interface CellOutput {
  type: "stdout" | "table" | "image" | "result" | "error";
  text?: string;
  data?: string;
  columns?: string[];
  rows?: (string | number | boolean | null)[][];
}
export interface NotebookCell {
  id: string;
  position: number;
  cell_type: string;
  source: string;
  outputs: CellOutput[];
  execution_count: number | null;
}
export interface NotebookSummary {
  id: string;
  workspace_id: string;
  name: string;
  updated_at: string;
  cell_count: number;
}
export interface NotebookDetail extends NotebookSummary {
  cells: NotebookCell[];
}

export const Notebooks = {
  list: (ws?: string) => api.get<NotebookSummary[]>(`/notebooks${ws ? `?workspace_id=${ws}` : ""}`),
  create: (workspaceId: string, name: string) =>
    api.post<NotebookDetail>("/notebooks", { workspace_id: workspaceId, name }),
  get: (id: string) => api.get<NotebookDetail>(`/notebooks/${id}`),
  addCell: (id: string, cellType: "code" | "markdown" = "code") =>
    api.post<NotebookCell>(`/notebooks/${id}/cells?cell_type=${cellType}`),
  updateCell: (id: string, cellId: string, source: string) =>
    api.patch<NotebookCell>(`/notebooks/${id}/cells/${cellId}`, { source }),
  runCell: (id: string, cellId: string) => api.post<NotebookCell>(`/notebooks/${id}/cells/${cellId}/run`),
  deleteCell: (id: string, cellId: string) => api.del<void>(`/notebooks/${id}/cells/${cellId}`),
  restart: (id: string) => api.post<void>(`/notebooks/${id}/restart`),
  remove: (id: string) => api.del<void>(`/notebooks/${id}`),
};
