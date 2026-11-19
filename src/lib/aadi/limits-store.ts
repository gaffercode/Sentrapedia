import "server-only";
import { withPrincipal } from "../sync/db";
import type { LimitsStore } from "./limits";

// The Postgres side of src/lib/aadi/limits.ts, on the tables of db/migrations/0003_analysis_limits.sql.
// Each decision is one statement that both checks and changes the row, so two requests arriving together cannot
// both read "room left" and then both take it. admit() runs its statements in the one transaction withPrincipal
// opens: a refusal throws, the transaction rolls back, and a person refused by the budget keeps their quota.

class Refused extends Error { constructor(readonly reason: "quota" | "budget") { super(reason); } }

export const limitsSql = {
  profile: "insert into profile (user_id, updated_at) values ($1, now()) on conflict (user_id) do nothing",
  // No row comes back when the person's count has reached the quota.
  count: `insert into analysis_usage (user_id, day, analyses) values ($1, $2, 1)
          on conflict (user_id, day) do update set analyses = analysis_usage.analyses + 1 where analysis_usage.analyses < $3
          returning analyses`,
  // No row comes back when spend plus running holds plus this hold would pass the budget.
  hold: `insert into analysis_budget_day (day, spent_usd, held_usd) values ($1, 0, $2)
         on conflict (day) do update set held_usd = analysis_budget_day.held_usd + excluded.held_usd
         where analysis_budget_day.spent_usd + analysis_budget_day.held_usd + excluded.held_usd <= $3
         returning day`,
  giveBack: "update analysis_usage set analyses = greatest(analyses - 1, 0) where user_id = $1 and day = $2",
  charge: `update analysis_budget_day set held_usd = greatest(held_usd - $2, 0), spent_usd = spent_usd + $3 where day = $1
           returning spent_usd`,
  // Matches once a day: the first settle that finds spend at or over the alert line.
  alert: "update analysis_budget_day set alerted_at = now() where day = $1 and alerted_at is null and spent_usd >= $2 returning day",
  // The account menu's count; row-level security already limits it to the principal's own rows.
  used: "select analyses from analysis_usage where user_id = $1 and day = $2",
} as const;

export function createPostgresLimitsStore(): LimitsStore {
  return {
    async admit(principal, day, quota, holdUsd, budgetUsd) {
      try {
        await withPrincipal(principal, async client => {
          // analysis_usage hangs off profile, so the parent row is ensured first, as src/lib/sync/store.ts does.
          await client.query(limitsSql.profile, [principal]);
          if (!(await client.query(limitsSql.count, [principal, day, quota])).rowCount) throw new Refused("quota");
          if (!(await client.query(limitsSql.hold, [day, holdUsd, budgetUsd])).rowCount) throw new Refused("budget");
        });
        return "admitted";
      } catch (error) {
        if (error instanceof Refused) return error.reason;
        throw error;
      }
    },
    async settle(principal, day, holdUsd, spentUsd, completed, alertAtUsd) {
      return withPrincipal(principal, async client => {
        if (!completed) await client.query(limitsSql.giveBack, [principal, day]);
        const charged = await client.query<{ spent_usd: string }>(limitsSql.charge, [day, holdUsd, spentUsd]);
        const alert = !!(await client.query(limitsSql.alert, [day, alertAtUsd])).rowCount;
        // numeric arrives as text from node-postgres.
        return { alert, spentUsd: Number(charged.rows[0]?.spent_usd ?? 0) };
      });
    },
    async used(principal, day) {
      return withPrincipal(principal, async client => Number((await client.query<{ analyses: number }>(limitsSql.used, [principal, day])).rows[0]?.analyses ?? 0));
    },
  };
}
