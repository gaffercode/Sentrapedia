import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// docs/data.md tells a newcomer how to build the account database on their own machine, and db/seed.dev.sql fills it
// with invented rows. These checks keep the two honest as the migrations grow; they need no database server.
const root = resolve(import.meta.dirname, "..");
const read = (path: string) => (existsSync(resolve(root, path)) ? readFileSync(resolve(root, path), "utf8") : "");
const stripComments = (text: string) => text.replace(/--[^\n]*/g, "");
const migrations = readdirSync(resolve(root, "db/migrations")).filter(name => name.endsWith(".sql")).sort();
const migrationSql = stripComments(migrations.map(name => read(`db/migrations/${name}`)).join("\n")).toLowerCase();
const tables = [...migrationSql.matchAll(/create table (?:if not exists )?(\w+)/g)].map(match => match[1]);
const seed = stripComments(read("db/seed.dev.sql")).toLowerCase();
const guide = read("docs/data.md");

describe("local account database", () => {
  it("ships a dummy seed that writes only to tables the migrations create", () => {
    const written = [...seed.matchAll(/insert into (\w+)/g)].map(match => match[1]);
    expect(written.length).toBeGreaterThan(0);
    expect(written.filter(table => !tables.includes(table))).toEqual([]);
  });

  it("seeds only the fictional account, inside a transaction that names it as the principal", () => {
    const users = [...seed.matchAll(/'(user_[a-z0-9]+)'/g)].map(match => match[1]);
    expect(new Set(users)).toEqual(new Set(["user_seed0001"]));
    expect(seed).toMatch(/set_config\('app\.user_id', 'user_seed0001', true\)/);
    expect(seed).toMatch(/^\s*begin;[\s\S]*commit;\s*$/);
  });

  it("can be applied twice", () => {
    const inserts = seed.split(/insert into/).slice(1);
    expect(inserts.length).toBeGreaterThan(0);
    expect(inserts.every(statement => statement.includes("on conflict"))).toBe(true);
  });

  it("is explained step by step in docs/data.md", () => {
    expect(guide).toMatch(/^## Account database on your own machine$/m);
    for (const step of ["db/migrations/*.sql", "sentrapedia_runtime", "db/seed.dev.sql", "SENTRAPEDIA_DATABASE_URL"]) expect(guide).toContain(step);
  });
});
