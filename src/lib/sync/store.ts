import "server-only";
import { withPrincipal } from "./db";
import { syncFormatVersion, type SyncPushResult, type SyncedDocument } from "./contract";
import { projectEncounterForSync, projectTemplateForSync, type SyncEncounterBody } from "./guard";
import type { PersonalTemplate } from "../workflow";
import type { Encounter } from "../workspace";

// Only the format this build understands is written, and only the same is read back, so a reader always
// predates a writer (docs/data.md). The column carries a check constraint for the same reason.
export async function pushEncounters(principal: string, encounters: Encounter[]): Promise<SyncPushResult> {
  const projections = encounters.map(encounter => ({ encounter, projection: projectEncounterForSync(encounter) }));
  const saved: string[] = [];
  const held = projections.filter(item => !item.projection.ok).map(item => item.encounter.id);
  const sendable = projections.flatMap(item => (item.projection.ok ? [item.projection] : []));
  if (!sendable.length) return { saved, held };

  await withPrincipal(principal, async client => {
    // The profile row is the parent of every synced document, so it is ensured in the same transaction.
    await client.query("insert into profile (user_id, updated_at) values ($1, now()) on conflict (user_id) do nothing", [principal]);
    for (const projection of sendable) {
      await client.query(
        `insert into workspace_sync (user_id, doc_id, format_version, patient_ref, body, updated_at)
         values ($1, $2, $3, $4, $5::jsonb, now())
         on conflict (user_id, doc_id) do update set format_version = excluded.format_version, patient_ref = excluded.patient_ref, body = excluded.body, updated_at = now()`,
        [principal, projection.docId, syncFormatVersion, projection.body.patientRef, JSON.stringify(projection.body)],
      );
      saved.push(projection.docId);
    }
  });
  return { saved, held };
}

// Erasure (2026-11-02, src/app/api/webhooks/clerk): profile is the parent of every row a principal owns, so deleting it
// cascades (db/migrations/0001 and 0002). It runs under the same row-level-security principal as every other query: the
// policy lets an owner delete its own rows, and nothing here needs the owner role. Returns the number of profiles removed.
export async function purgePrincipal(principal: string): Promise<number> {
  return withPrincipal(principal, async client => (await client.query("delete from profile where user_id = $1", [principal])).rowCount ?? 0);
}

export async function pullEncounters(principal: string): Promise<SyncedDocument[]> {
  return withPrincipal(principal, async client => {
    const { rows } = await client.query<{ doc_id: string; format_version: number; patient_ref: string | null; body: SyncEncounterBody; updated_at: Date }>(
      "select doc_id, format_version, patient_ref, body, updated_at from workspace_sync where format_version = $1 order by updated_at desc",
      [syncFormatVersion],
    );
    return rows.map(row => ({ docId: row.doc_id, formatVersion: row.format_version, patientRef: row.patient_ref, body: row.body, updatedAt: row.updated_at.toISOString() }));
  });
}

// Personal templates (docs/FEATURE-IDEAS.md idea 6) on personal_template from db/migrations/0001, which had no writer
// until 2026-11-19. Same guard rule as documents: a template carrying identity is held, the rest are upserted.
export async function pushTemplates(principal: string, templates: PersonalTemplate[]): Promise<{ saved: string[]; held: string[] }> {
  const projections = templates.map(template => ({ template, projection: projectTemplateForSync(template) }));
  const held = projections.filter(item => !item.projection.ok).map(item => item.template.id);
  const sendable = projections.flatMap(item => (item.projection.ok ? [item.projection] : []));
  if (!sendable.length) return { saved: [], held };
  await withPrincipal(principal, async client => {
    await client.query("insert into profile (user_id, updated_at) values ($1, now()) on conflict (user_id) do nothing", [principal]);
    for (const projection of sendable) {
      await client.query(
        `insert into personal_template (user_id, template_id, body, updated_at) values ($1, $2, $3::jsonb, now())
         on conflict (user_id, template_id) do update set body = excluded.body, updated_at = now()`,
        [principal, projection.id, JSON.stringify(projection.body)],
      );
    }
  });
  return { saved: sendable.map(projection => projection.id), held };
}

export async function pullTemplates(principal: string): Promise<unknown[]> {
  return withPrincipal(principal, async client => (await client.query<{ body: unknown }>("select body from personal_template order by updated_at desc")).rows.map(row => row.body));
}
