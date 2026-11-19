import "server-only";
import { withPrincipal } from "./sync/db";
import type { FeedbackStore } from "./feedback";

// The Postgres side of src/lib/feedback.ts, on the table of db/migrations/0005_workspace_feedback.sql.
export const feedbackSql = {
  profile: "insert into profile (user_id, updated_at) values ($1, now()) on conflict (user_id) do nothing",
  add: "insert into workspace_feedback (user_id, note) values ($1, $2)",
} as const;

export function createPostgresFeedbackStore(): FeedbackStore {
  return {
    async add(principal, note) {
      await withPrincipal(principal, async client => {
        // workspace_feedback hangs off profile, so the parent row is ensured first, as output-report-store.ts does.
        await client.query(feedbackSql.profile, [principal]);
        await client.query(feedbackSql.add, [principal, note]);
      });
    },
  };
}
