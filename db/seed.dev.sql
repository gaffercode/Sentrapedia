-- Dummy rows for a local or disposable account database. Everything here is invented: one fictional account with
-- one template of its own. No patient data ever belongs in this database (see 0001_account_and_templates.sql).
-- Apply it after the migrations, as the database owner:
--   psql "$OWNER_URL" -v ON_ERROR_STOP=1 -q -f db/seed.dev.sql
-- It is safe to run twice. Never run it against the production database.
begin;

-- Row-level security is forced on every table, so the fictional account is named as the principal first.
do $$
begin
  perform set_config('app.user_id', 'user_seed0001', true);
end
$$;

insert into profile (user_id, specialty, language, display_name)
values ('user_seed0001', 'Dokter umum', 'id', 'dr. Contoh (data fiktif)')
on conflict (user_id) do nothing;

insert into personal_template (user_id, template_id, body)
values ('user_seed0001', 'seed-template-0001', '{"title": "CONTOH: catatan kunjungan", "sections": ["Keluhan", "Pemeriksaan", "Rencana"]}'::jsonb)
on conflict (user_id, template_id) do nothing;

commit;
