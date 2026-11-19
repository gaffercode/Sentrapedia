-- General feedback from the workspace sidebar (docs/FEATURE-IDEAS.md idea 4, chosen by Gaffer on 2026-11-19). The box used to
-- thank the user and keep nothing. Written only by src/lib/feedback-store.ts. Separate from output_report (0004), which
-- names one analysis. 0001 to 0004 are never edited.
--
-- Holds the clinician's note and nothing else. The note is refused by the application when it carries an identity
-- pattern (src/lib/aadi/contract.ts, containsIdentity).
--
-- Rows hang off profile, so erasing an account (src/lib/sync/store.ts, purgePrincipal) removes that person's feedback too.
-- The runtime role may only add rows and read its own; Gaffer reads them with the owner role.
begin;

create table if not exists workspace_feedback (
  id      uuid primary key default gen_random_uuid(),
  user_id text not null references profile (user_id) on delete cascade,
  note    text not null,
  sent_at timestamptz not null default now(),
  constraint workspace_feedback_note_length check (char_length(note) between 1 and 1000)
);
create index if not exists workspace_feedback_sent_at on workspace_feedback (sent_at);

alter table workspace_feedback enable row level security;
alter table workspace_feedback force row level security;
create policy workspace_feedback_principal on workspace_feedback
  using (user_id = current_setting('app.user_id', true))
  with check (user_id = current_setting('app.user_id', true));

-- No update and no delete: feedback is not changed or withdrawn by the application.
grant select, insert on workspace_feedback to sentrapedia_runtime;

commit;
