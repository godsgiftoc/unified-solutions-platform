"use client";

import { useState } from "react";

import { brandFor, logoSources } from "@/lib/connectorBrand";

/**
 * Renders the real service logo (favicon), cascading through providers on error
 * and finally falling back to a branded monogram tile so a logo box is never
 * empty or broken. The tile stays white in both themes so logos read correctly.
 */
export function ConnectorLogo({ type, size = 44 }: { type: string; size?: number }) {
  const brand = brandFor(type);
  const sources = brand.generic ? [] : logoSources(brand.domain);
  const [idx, setIdx] = useState(0);
  const showMonogram = brand.generic || idx >= sources.length;

  if (showMonogram) {
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

  return (
    <div
      // Arbitrary white (not `bg-white`) so the dark-mode override leaves it light —
      // logos are designed for a white background.
      className="flex items-center justify-center overflow-hidden rounded-xl bg-[#ffffff] ring-1 ring-black/10 dark:ring-white/15"
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sources[idx]}
        alt={`${type} logo`}
        width={Math.round(size * 0.58)}
        height={Math.round(size * 0.58)}
        className="object-contain"
        onError={() => setIdx((i) => i + 1)}
      />
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
