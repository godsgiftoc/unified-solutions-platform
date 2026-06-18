import type { QueryResult } from "@/lib/api";

export interface GlobalFilters {
  state?: string;
  lga?: string;
  from?: string;
  to?: string;
}

export const colIndex = (columns: string[], name: string) =>
  columns.findIndex((c) => c.toLowerCase() === name);

/** First column that looks like a date/period (by name). */
export function detectDateCol(columns: string[]): string | undefined {
  return columns.find((c) => /(^|_)(date|day|period|year|time|created|reported|visit_date)($|_)/i.test(c));
}

/** Apply the dashboard's global filters to one tile's data. A tile that doesn't
 *  share a given dimension is simply left untouched by that filter. */
export function applyGlobalFilters(result: QueryResult, f: GlobalFilters): QueryResult {
  let rows = result.rows;

  const si = colIndex(result.columns, "state");
  if (f.state && si >= 0) rows = rows.filter((r) => String(r[si]) === f.state);

  const li = colIndex(result.columns, "lga");
  if (f.lga && li >= 0) rows = rows.filter((r) => String(r[li]) === f.lga);

  if (f.from || f.to) {
    const dc = detectDateCol(result.columns);
    if (dc) {
      const di = result.columns.indexOf(dc);
      const fromT = f.from ? Date.parse(f.from) : -Infinity;
      const toT = f.to ? Date.parse(f.to) : Infinity;
      rows = rows.filter((r) => {
        const t = Date.parse(String(r[di]));
        if (Number.isNaN(t)) return true; // non-parseable values aren't filtered out
        return t >= fromT && t <= toT;
      });
    }
  }

  return rows === result.rows ? result : { ...result, rows, row_count: rows.length };
}
