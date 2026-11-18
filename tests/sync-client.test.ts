import { afterEach, describe, expect, it, vi } from "vitest";
import { pushEncountersToServer } from "../src/lib/sync/client";
import type { Encounter } from "../src/lib/workspace";

afterEach(() => vi.unstubAllGlobals());

describe("sync client", () => {
  it("never sends a message's sourceText, which the server does not store", async () => {
    const fetchMock = vi.fn(async () => Response.json({ saved: ["e1"], held: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const encounter = { id: "e1", title: "Kasus", context: "", createdAt: "2026-11-18T00:00:00.000Z", messages: [{ id: "m1", role: "assistant", content: "Draft", mode: "soap", createdAt: "2026-11-18T00:00:00.000Z", sourceText: "{\"kind\":\"AADI\",\"catalogue\":[]}" }] } as unknown as Encounter;
    expect(await pushEncountersToServer([encounter])).toEqual({ ok: true, value: { saved: ["e1"], held: [] } });
    const sent = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as { encounters: Encounter[] };
    expect(sent.encounters[0].messages?.[0]).toEqual({ id: "m1", role: "assistant", content: "Draft", mode: "soap", createdAt: "2026-11-18T00:00:00.000Z" });
    expect(encounter.messages?.[0].sourceText).toBeDefined();
  });
});
