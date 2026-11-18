-- Reports of problematic analysis output for the gated beta (Gaffer, 2026-11-17): a clinician marks an AADI answer as
-- incorrect, unsafe or other, with an optional note, for Gaffer's review. Written only by src/lib/aadi/output-report-store.ts.
-- Separate from any general feedback. 0001 to 0003 are never edited.
--
-- Holds the analysis trace id, the category and the clinician's note. Never the case text or the answer: those stay in the
-- reporter's browser, and the trace id matches the engine's audit line without storing either. The note is refused by the
-- application when it carries an identity pattern (src/lib/aadi/contract.ts, containsIdentity).
--
-- Rows hang off profile, so erasing an account (src/lib/sync/store.ts, purgePrincipal) removes that person's reports too.
-- The runtime role may only add rows and read its own; Gaffer reviews them with the owner role.

begin;

create table if not exists output_report (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null references profile (user_id) on delete cascade,
  trace_id    uuid not null,
  category    text not null,
  note        text not null default '',
  reported_at timestamptz not null default now(),
  constraint output_report_category check (category in ('incorrect', 'unsafe', 'other')),
  constraint output_report_note_length check (char_length(note) <= 1000)
);

create index if not exists output_report_reported_at on output_report (reported_at);

alter table output_report enable row level security;
alter table output_report force row level security;

create policy output_report_principal on output_report
  using (user_id = current_setting('app.user_id', true))
  with check (user_id = current_setting('app.user_id', true));

-- No update and no delete: a report is not changed or withdrawn by the application. gen_random_uuid() is built in since
-- PostgreSQL 13, so no extension and no sequence grant is needed.
grant select, insert on output_report to sentrapedia_runtime;

commit;
