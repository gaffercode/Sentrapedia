// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { AgentPage } from "../../src/components/agent-page";

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const leaveEvent = () => { const link = screen.getByRole("link", { name: "Kembali ke encounter" }); const event = createEvent.click(link, { button: 0 }); fireEvent(link, event); return event; };

describe("/agent leaving with unsaved edits", () => {
  it("asks before leaving with an unsaved edit, and stays when the answer is no", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<AgentPage userId="local-development" local theoracle={null}/>);
    fireEvent.change(await screen.findByLabelText("Nama panggilan"), { target: { value: "dr. Belum Simpan" } });
    expect(leaveEvent().defaultPrevented).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("leaves without asking when nothing is unsaved, including right after a save", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<AgentPage userId="local-development" local theoracle={null}/>);
    fireEvent.change(await screen.findByLabelText("Nama panggilan"), { target: { value: "dr. Tersimpan" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan preferensi" }));
    leaveEvent();
    expect(confirm).not.toHaveBeenCalled();
  });
});
