/**
 * Client-safe audit helpers (no DB, no "server-only"), so both the server
 * loaders and the client components can share them.
 */

/** e.g. "Engineering dept" or "HQ — Floor 2", or "All assets" when unscoped. */
export function scopeLabel(summary: {
  scopeDepartmentName: string | null;
  scopeLocation: string | null;
}): string {
  if (summary.scopeDepartmentName) return `${summary.scopeDepartmentName} dept`;
  if (summary.scopeLocation) return summary.scopeLocation;
  return "All assets";
}
