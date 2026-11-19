import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// The SQL of src/lib/aadi/limits-store.ts against a real Postgres. It runs only when SENTRAPEDIA_TEST_DATABASE_URL
// names a scratch database that has db/migrations 0001-0003 applied and is reached as sentrapedia_runtime; without
// it the suite is skipped, and aadi-limits.test.ts covers the same rules on the memory store. Never point it at a
// database that holds real rows: it deletes the profiles and budget days it creates.
const url = process.env.SENTRAPEDIA_TEST_DATABASE_URL;
vi.mock("server-only", () => ({}));

describe.skipIf(!url)("analysis limits on Postgres", () => {
  const people = ["user_limitsA", "user_limitsB", "user_limitsC", "user_limitsD", "user_limitsE"];
  const load = async () => {
    process.env.SENTRAPEDIA_DATABASE_URL = url;
    const { createPostgresLimitsStore } = await import("../src/lib/aadi/limits-store");
    const db = await import("../src/lib/sync/db");
    return { store: createPostgresLimitsStore(), ...db };
  };
  // The runtime role may not delete a budget day, so each test works on its own day instead of clearing one.
  let serial = 0;
  const freshDay = () => `2099-02-${String(++serial).padStart(2, "0")}`;
  beforeEach(async () => {
    const { withPrincipal } = await load();
    for (const person of people) await withPrincipal(person, client => client.query("delete from profile where user_id = $1", [person]));
  });
  afterAll(async () => { const { closeSyncPool } = await load(); await closeSyncPool(); });

  it("admits up to the quota, refuses the next, and gives a place back", async () => {
    const { store } = await load(); const d = freshDay();
    expect(await store.admit(people[0], d, 2, 0.1, 5)).toBe("admitted");
    expect(await store.admit(people[0], d, 2, 0.1, 5)).toBe("admitted");
    expect(await store.admit(people[0], d, 2, 0.1, 5)).toBe("quota");
    await store.settle(people[0], d, 0.1, 0, false, 4);
    expect(await store.admit(people[0], d, 2, 0.1, 5)).toBe("admitted");
    expect(await store.admit(people[1], d, 2, 0.1, 5)).toBe("admitted");
  });

  it("holds running caps against the budget and rolls the quota back for a person the budget refuses", async () => {
    const { store } = await load(); const d = freshDay();
    expect(await store.admit(people[0], d, 1, 0.2, 0.5)).toBe("admitted");
    expect(await store.admit(people[1], d, 1, 0.2, 0.5)).toBe("admitted");
    expect(await store.admit(people[2], d, 1, 0.2, 0.5)).toBe("budget");
    await store.settle(people[0], d, 0.2, 0.01, true, 0.4);
    // The refusal above must not have used the person's only place.
    expect(await store.admit(people[2], d, 1, 0.2, 0.5)).toBe("admitted");
  });

  it("charges spend, alerts once at the line, and stops at the budget", async () => {
    const { store } = await load(); const d = freshDay();
    expect(await store.admit(people[0], d, 9, 0.1, 1)).toBe("admitted");
    expect(await store.settle(people[0], d, 0.1, 0.79, true, 0.8)).toEqual({ alert: false, spentUsd: 0.79 });
    expect(await store.admit(people[0], d, 9, 0.1, 1)).toBe("admitted");
    expect(await store.settle(people[0], d, 0.1, 0.01, true, 0.8)).toEqual({ alert: true, spentUsd: 0.8 });
    expect(await store.admit(people[0], d, 9, 0.1, 1)).toBe("admitted");
    expect(await store.settle(people[0], d, 0.1, 0.15, true, 0.8)).toEqual({ alert: false, spentUsd: 0.95 });
    expect(await store.admit(people[0], d, 9, 0.1, 1)).toBe("budget");
  });

  it("never lets requests that arrive together pass the quota or the budget", async () => {
    const { store } = await load(); const d = freshDay();
    const samePerson = await Promise.all(Array.from({ length: 8 }, () => store.admit(people[0], d, 3, 0.01, 5)));
    expect(samePerson.filter(outcome => outcome === "admitted")).toHaveLength(3);
    expect(samePerson.filter(outcome => outcome === "quota")).toHaveLength(5);
    const d2 = freshDay();
    const together = await Promise.all(people.map(person => store.admit(person, d2, 9, 0.2, 0.5)));
    expect(together.filter(outcome => outcome === "admitted")).toHaveLength(2);
    expect(together.filter(outcome => outcome === "budget")).toHaveLength(3);
  });

  it("removes a person's count with their account but leaves the day's spend", async () => {
    const { store, withPrincipal } = await load(); const d = freshDay();
    await store.admit(people[0], d, 9, 0.1, 5);
    await store.settle(people[0], d, 0.1, 0.3, true, 4);
    await withPrincipal(people[0], client => client.query("delete from profile where user_id = $1", [people[0]]));
    const seen = await withPrincipal(people[1], async client => ({
      usage: (await client.query("select count(*)::int as n from analysis_usage where day = $1", [d])).rows[0].n as number,
      spent: Number((await client.query("select spent_usd from analysis_budget_day where day = $1", [d])).rows[0].spent_usd),
    }));
    expect(seen).toEqual({ usage: 0, spent: 0.3 });
  });

  it("shows a person only their own count, and nothing at all without a principal", async () => {
    const { store, withPrincipal } = await load(); const d = freshDay();
    await store.admit(people[0], d, 9, 0.1, 5);
    await store.admit(people[1], d, 9, 0.1, 5);
    const mine = await withPrincipal(people[0], async client => (await client.query("select user_id from analysis_usage where day = $1", [d])).rows.map(row => row.user_id as string));
    expect(mine).toEqual([people[0]]);
    const { Pool } = await import("pg");
    const bare = new Pool({ connectionString: url, max: 1 });
    try {
      expect((await bare.query("select 1 from analysis_usage where day = $1", [d])).rowCount).toBe(0);
      expect((await bare.query("select 1 from analysis_budget_day where day = $1", [d])).rowCount).toBe(0);
      await expect(bare.query("delete from analysis_budget_day where day = $1", [d])).rejects.toThrow(/permission denied/);
    } finally { await bare.end(); }
  });
});

describe("daily usage read", () => {
  it("reads only the person's own row for the day", async () => {
    const { limitsSql } = await import("../src/lib/aadi/limits-store");
    expect(limitsSql.used.replace(/\s+/g, " ").trim()).toBe("select analyses from analysis_usage where user_id = $1 and day = $2");
  });
});
