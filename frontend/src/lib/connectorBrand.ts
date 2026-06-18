// Brand metadata per connector type: used to load the REAL service logo
// (with graceful fallback) and to colour monogram tiles for generic sources.

export interface Brand {
  color: string;
  initials: string;
  // Company/site domain — drives logo + favicon lookups.
  domain?: string;
  // Generic sources (no brand) render a monogram tile instead of a fetched logo.
  generic?: boolean;
}

export const CONNECTOR_BRAND: Record<string, Brand> = {
  postgres: { color: "#336791", initials: "PG", domain: "postgresql.org" },
  commcare: { color: "#1c9b8e", initials: "CC", domain: "dimagi.com" },
  kobo: { color: "#2f7ed8", initials: "KB", domain: "kobotoolbox.org" },
  odk: { color: "#3aa53a", initials: "OD", domain: "getodk.org" },
  dhis2: { color: "#147cd7", initials: "D2", domain: "dhis2.org" },
  surveycto: { color: "#0a7d3e", initials: "SC", domain: "surveycto.com" },
  gsheets: { color: "#0f9d58", initials: "GS", domain: "sheets.google.com" },
  gdrive: { color: "#1da462", initials: "GD", domain: "drive.google.com" },
  databricks: { color: "#ff3621", initials: "DB", domain: "databricks.com" },
  rest: { color: "#5340e0", initials: "{ }", generic: true },
  csv_upload: { color: "#16a34a", initials: "CSV", generic: true },
};

export function brandFor(type: string): Brand {
  return CONNECTOR_BRAND[type] ?? { color: "#5340e0", initials: type.slice(0, 2).toUpperCase() };
}

// Ordered list of logo URLs to try for a domain (best → fallback).
export function logoSources(domain?: string): string[] {
  if (!domain) return [];
  return [
    `https://logo.clearbit.com/${domain}`,
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
  ];
}
