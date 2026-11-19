import type { DailyUsage } from "./limits";

// Browser side of GET /api/aadi/usage. The count is a hint for the account menu, so every failure is simply "no count".
export async function fetchDailyUsage(): Promise<DailyUsage | null> {
  try {
    const response = await fetch("/api/aadi/usage", { cache: "no-store" });
    if (!response.ok) return null;
    const { usage } = await response.json() as { usage?: unknown };
    if (!usage || typeof usage !== "object") return null;
    const { used, quota } = usage as Record<string, unknown>;
    return Number.isInteger(used) && Number.isInteger(quota) ? { used: used as number, quota: quota as number } : null;
  } catch { return null; }
}
