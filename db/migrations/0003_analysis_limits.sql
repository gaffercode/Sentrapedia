-- Analysis limits for the gated beta (Gaffer, 2026-11-17): a daily quota per person and one shared daily budget.
-- Read and written only by src/lib/aadi/limits-store.ts. 0001 and 0002 are never edited.
--
-- Neither table holds case text, a result, or anything about a patient: only a principal, a UTC day, a count and
-- money. The reason they are here and not in the engine's audit folder is that the folder lives inside the
-- container and is emptied by every rebuild, which let a deploy restart the day's budget from zero.

begin;

-- One row per person per UTC day. It hangs off profile like every other per-person row, so the erasure in
-- src/lib/sync/store.ts (purgePrincipal) removes it too.
create table if not exists analysis_usage (
  user_id  text not null references profile (user_id) on delete cascade,
  day      date not null,
  analyses integer not null default 0,
  primary key (user_id, day),
  constraint analysis_usage_not_negative check (analyses >= 0)
);

alter table analysis_usage enable row level security;
alter table analysis_usage force row level security;

create policy analysis_usage_principal on analysis_usage
  using (user_id = current_setting('app.user_id', true))
  with check (user_id = current_setting('app.user_id', true));

grant select, insert, update, delete on analysis_usage to sentrapedia_runtime;

-- One row per UTC day for everyone together. It deliberately carries no user_id and does not hang off profile:
-- the day's spend must not shrink when an account is erased, and it must be the same number whoever asks.
--   spent_usd  what settled analyses cost;
--   held_usd   the cost caps of analyses still running, so analyses started together cannot pass the limit;
--   alerted_at set once, when spend first reaches the alert line, so the alert is raised once a day.
create table if not exists analysis_budget_day (
  day        date primary key,
  spent_usd  numeric(12, 6) not null default 0,
  held_usd   numeric(12, 6) not null default 0,
  alerted_at timestamptz,
  constraint analysis_budget_day_not_negative check (spent_usd >= 0 and held_usd >= 0)
);

alter table analysis_budget_day enable row level security;
alter table analysis_budget_day force row level security;

-- Shared by design, so the policy cannot compare a row to the principal. It still requires that one is set:
-- every query reaches the database through withPrincipal (src/lib/sync/db.ts), and a connection without a
-- principal reads and writes nothing here either. nullif covers the empty string a pooled session reports
-- after an earlier transaction-local setting has ended.
create policy analysis_budget_day_any_principal on analysis_budget_day
  using (nullif(current_setting('app.user_id', true), '') is not null)
  with check (nullif(current_setting('app.user_id', true), '') is not null);

-- No delete: a day's spend is never removed by the application.
grant select, insert, update on analysis_budget_day to sentrapedia_runtime;

commit;
