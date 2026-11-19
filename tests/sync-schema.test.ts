import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// The migrations are the only place the three RLS conditions can be made true (plan 2026-10-25-e2e-integration, 4.3):
// force row level security, a non-owner nosuperuser nobypassrls runtime role, and both using and with check.
// A table that enables RLS without forcing it is still readable by its owner, so "database-level isolation" would be false.
const migrationsDir = resolve(import.meta.dirname, "../db/migrations");
const files = existsSync(migrationsDir) ? readdirSync(migrationsDir).filter(name => name.endsWith(".sql")).sort() : [];
// Comments are prose, not grants: a line explaining why the role is not superuser must not read as one.
const stripComments = (text: string) => text.replace(/--[^\n]*/g, "");
const sql = stripComments(files.map(name => readFileSync(resolve(migrationsDir, name), "utf8")).join("\n")).toLowerCase();
const tablesOf = (text: string) => [...text.matchAll(/create table (?:if not exists )?(\w+)/g)].map(match => match[1]);

describe("sync migrations", () => {
  it("ships at least one migration", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("holds exactly the tables the decisions have settled", () => {
    // workspace_sync joined on 2026-10-25, when Gaffer answered that document bodies do sync.
    // analysis_usage and analysis_budget_day joined on 2026-11-17 with the gated beta's limits (0003).
    // output_report joined the same day with the report of problematic output (0004).
    // workspace_feedback joined on 2026-11-19 when Gaffer chose to build the kept sidebar feedback (0005).
    expect(tablesOf(sql).sort()).toEqual(["analysis_budget_day", "analysis_usage", "output_report", "personal_template", "profile", "workspace_feedback", "workspace_sync"]);
  });

  it("pins the stored format on every synced document, so a reader can predate a writer", () => {
    expect(sql).toMatch(/create table (?:if not exists )?workspace_sync[\s\S]*?format_version\s+int(?:eger)? not null/);
  });

  it("enables and forces row level security on every table it creates", () => {
    for (const table of tablesOf(sql)) {
      expect(sql, `${table} must enable row level security`).toContain(`alter table ${table} enable row level security`);
      expect(sql, `${table} must force row level security, or its owner bypasses every policy`).toContain(`alter table ${table} force row level security`);
    }
  });

  it("gives every table a policy carrying both using and with check over the principal", () => {
    for (const table of tablesOf(sql)) {
      const policy = new RegExp(`create policy [\\s\\S]*?on ${table}[\\s\\S]*?using \\([\\s\\S]*?current_setting\\('app\\.user_id', true\\)[\\s\\S]*?with check \\([\\s\\S]*?current_setting\\('app\\.user_id', true\\)`);
      expect(policy.test(sql), `${table} needs using and with check over current_setting('app.user_id', true)`).toBe(true);
    }
  });

  it("creates a runtime role that is nosuperuser and nobypassrls and owns nothing", () => {
    expect(sql).toMatch(/create role \w+[\s\S]*?login/);
    expect(sql).toContain("nosuperuser");
    expect(sql).toContain("nobypassrls");
    // Matched with a lookbehind so the negative forms above do not satisfy their own prohibition.
    expect(sql, "the runtime role must never be superuser").not.toMatch(/(?<!no)superuser/);
    expect(sql, "the runtime role must never bypass RLS").not.toMatch(/(?<!no)bypassrls/);
    // Ownership is what condition 1 defends against, so the migrations must never hand tables to the runtime role.
    expect(sql).not.toMatch(/alter table \w+ owner to sentrapedia_runtime/);
  });

  it("grants the runtime role data access only, never schema or ownership rights", () => {
    expect(sql).toMatch(/grant select, insert, update, delete on/);
    for (const forbidden of ["grant all", "with superuser", "grant create on"]) {
      expect(sql, `migrations must not contain "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it("stores no patient identity: pseudonymisation at the edge keeps the name in the browser", () => {
    // Decision 2026-10-25: patient_ref is the random local id. Any name, NIK, BPJS, phone or email column breaks D1.
    for (const forbidden of ["patient_name", " name ", "nik", "bpjs", "phone", "birth"]) {
      expect(sql, `a column matching "${forbidden.trim()}" would put patient identity on the server`).not.toContain(forbidden);
    }
  });
});

describe("analysis limits migration", () => {
  const limits = stripComments(readFileSync(resolve(migrationsDir, "0003_analysis_limits.sql"), "utf8")).toLowerCase();

  it("counts per person behind that person's own policy, and removes the count with the account", () => {
    expect(limits).toMatch(/create table if not exists analysis_usage[\s\S]*?user_id\s+text not null references profile \(user_id\) on delete cascade/);
    expect(limits).toMatch(/create policy \w+ on analysis_usage\s+using \(user_id = current_setting\('app\.user_id', true\)\)\s+with check \(user_id = current_setting\('app\.user_id', true\)\)/);
  });

  it("keeps the shared day's spend apart from any account, so an erasure cannot lower it", () => {
    const shared = /create table if not exists analysis_budget_day \(([\s\S]*?)\);/.exec(limits)?.[1] ?? "";
    expect(shared).toContain("spent_usd");
    expect(shared).not.toContain("user_id");
    expect(shared).not.toContain("references");
  });

  it("lets nothing reach the shared day without a principal, and never lets the application delete a day", () => {
    expect(limits).toMatch(/create policy \w+ on analysis_budget_day\s+using \(nullif\(current_setting\('app\.user_id', true\), ''\) is not null\)\s+with check \(nullif\(current_setting\('app\.user_id', true\), ''\) is not null\)/);
    expect(limits).toContain("grant select, insert, update on analysis_budget_day to sentrapedia_runtime");
  });

  it("stores counts and money only: no case text, no result", () => {
    for (const forbidden of ["jsonb", "body", "complaint", "diagnos"]) expect(limits).not.toContain(forbidden);
  });
});
