// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { ThinkingCard, stageProgress } from "../../src/components/thinking-card";

afterEach(cleanup);

describe("ThinkingCard", () => {
  it("shows only the two honest steps inside a live region that wraps the list", () => {
    render(<ThinkingCard onCancel={vi.fn()} startedAt={performance.now()}/>);
    const status = screen.getByRole("status");
    expect(status.tagName).toBe("DIV");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(within(status).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Permintaan diterima", expect.stringMatching(/^Menunggu jawaban AADI · \d+ dtk$/)]);
    expect(screen.queryByText(/pedoman klinis ditelusuri/)).toBeNull();
  });
  it("counts the seconds since the request was sent", () => {
    render(<ThinkingCard onCancel={vi.fn()} startedAt={performance.now() - 7_200}/>);
    expect(screen.getByText(/Menunggu jawaban AADI · 7 dtk/)).toBeTruthy();
  });
});

describe("the wait card with stage progress", () => {
  it("shows only the stages the gateway reported, done ones ticked and the running one with the time", () => {
    render(<ThinkingCard onCancel={() => undefined} stages={[{ stage: "retrieve_dx", state: "running" }, { stage: "retrieve_dx", state: "done" }, { stage: "aadi_dx", state: "running" }]}/>);
    const items = screen.getAllByRole("listitem").map(item => item.textContent);
    expect(items).toEqual(["Permintaan diterima", "Mencari referensi Oracle", expect.stringMatching(/^Menyusun diagnosis banding · \d+ dtk$/)]);
    expect(screen.queryByText(/Menyusun usulan terapi/)).toBeNull();
    expect(screen.queryByText(/Menunggu jawaban AADI/)).toBeNull();
  });
  it("says a failed stage did not succeed, and that the reply is being assembled once no stage runs", () => {
    render(<ThinkingCard onCancel={() => undefined} stages={[{ stage: "retrieve_tx", state: "running" }, { stage: "retrieve_tx", state: "failed" }]}/>);
    expect(screen.getByText("Mencari referensi terapi · tidak berhasil")).toBeTruthy();
    expect(screen.getByText(/Menyelesaikan jawaban · \d+ dtk/)).toBeTruthy();
  });
  it("keeps each stage once, in the order it first appeared", () => {
    expect(stageProgress([{ stage: "aadi_dx", state: "running" }, { stage: "gate", state: "running" }, { stage: "aadi_dx", state: "done" }])).toEqual([{ stage: "aadi_dx", state: "done" }, { stage: "gate", state: "running" }]);
  });
});
