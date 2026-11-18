import "server-only";
import { withPrincipal } from "../sync/db";
import type { ReportStore } from "./output-report";

// The Postgres side of src/lib/aadi/output-report.ts, on the table of db/migrations/0004_output_reports.sql.
export const reportSql = {
  profile: "insert into profile (user_id, updated_at) values ($1, now()) on conflict (user_id) do nothing",
  add: "insert into output_report (user_id, trace_id, category, note) values ($1, $2, $3, $4)",
} as const;

export function createPostgresReportStore(): ReportStore {
  return {
    async add(principal, report) {
      await withPrincipal(principal, async client => {
        // output_report hangs off profile, so the parent row is ensured first, as limits-store.ts does.
        await client.query(reportSql.profile, [principal]);
        await client.query(reportSql.add, [principal, report.traceId, report.category, report.note]);
      });
    },
  };
}
