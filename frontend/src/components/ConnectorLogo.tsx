"use client";

import { brandFor } from "@/lib/connectorBrand";

/**
 * A branded monogram tile per connector. We render the monogram directly (no
 * external logo CDN) so tiles always look clean, work offline, and don't depend
 * on third-party hosts.
 */
export function ConnectorLogo({ type, size = 44 }: { type: string; size?: number }) {
  const brand = brandFor(type);
  return (
    <div
      className="flex items-center justify-center rounded-xl font-bold text-white shadow-sm"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(11, size * 0.3),
        background: `linear-gradient(135deg, ${brand.color}, ${shade(brand.color, -18)})`,
      }}
    >
      {brand.initials}
    </div>
  );
}

// Lighten/darken a hex color by percent (for the monogram gradient).
function shade(hex: string, percent: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + Math.round((255 * percent) / 100)));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + Math.round((255 * percent) / 100)));
  const b = Math.max(0, Math.min(255, (n & 0xff) + Math.round((255 * percent) / 100)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
