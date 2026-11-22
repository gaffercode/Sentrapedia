// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceGreeting } from "../../src/components/workspace-greeting";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 21, 20, 30)); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("WorkspaceGreeting", () => {
  it("types the greeting once, keeps the whole line in the document, and drops the caret when done", () => {
    const { container } = render(<WorkspaceGreeting name="dr. Rani"/>);
    const text = container.querySelector(".greeting-text");
    const line = text?.textContent ?? "";
    expect(line).toBe("Selamat malam, dr. Rani");
    expect(container.querySelector(".greeting-typed")?.textContent).toBe("");
    expect(container.querySelector(".greeting-caret")).not.toBeNull();

    act(() => { vi.advanceTimersByTime(200); });
    const partial = container.querySelector(".greeting-typed")?.textContent ?? "";
    expect(partial.length).toBeGreaterThan(0);
    expect(partial.length).toBeLessThan(line.length);
    expect(line.startsWith(partial)).toBe(true);
    expect(text?.textContent).toBe(line);

    for (let i = 0; i < line.length; i++) act(() => { vi.advanceTimersByTime(150); });
    expect(container.querySelector(".greeting-typed")?.textContent).toBe(line);
    expect(container.querySelector(".greeting-caret")).toBeNull();
    expect(text?.textContent).toBe(line);
  });
});
