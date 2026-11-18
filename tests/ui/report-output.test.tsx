// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReportOutput } from "../../src/components/report-output";

const traceId = "021fad02-4f6c-49f3-8fa2-912add178074";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("report problematic output", () => {
  it("sends only the trace id, the chosen category and the note", async () => {
    const send = vi.fn(async () => Response.json({ status: "ok" })); vi.stubGlobal("fetch", send);
    render(<ReportOutput traceId={traceId}/>);
    fireEvent.click(screen.getByRole("button", { name: "Laporkan output bermasalah" }));
    expect(screen.getByRole("button", { name: "Kirim laporan" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByLabelText("Tidak aman"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Interaksi obat tidak disebut." } });
    fireEvent.click(screen.getByRole("button", { name: "Kirim laporan" }));
    await screen.findByText(/Laporan terkirim/);
    const [url, options] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/aadi/report");
    expect(JSON.parse(options.body as string)).toEqual({ traceId, category: "unsafe", note: "Interaksi obat tidak disebut." });
  });

  it("stops a note with an identity pattern in the browser", () => {
    const send = vi.fn(); vi.stubGlobal("fetch", send);
    render(<ReportOutput traceId={traceId}/>);
    fireEvent.click(screen.getByRole("button", { name: "Laporkan output bermasalah" }));
    fireEvent.click(screen.getByLabelText("Lainnya"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "NIK 3201234567890123" } });
    fireEvent.click(screen.getByRole("button", { name: "Kirim laporan" }));
    expect(screen.getByRole("alert").textContent).toContain("pola identitas");
    expect(send).not.toHaveBeenCalled();
  });

  it("shows the server's refusal and keeps the form for another try", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { message: "Penyimpanan laporan belum aktif di instance ini." } }, { status: 503 })));
    render(<ReportOutput traceId={traceId}/>);
    fireEvent.click(screen.getByRole("button", { name: "Laporkan output bermasalah" }));
    fireEvent.click(screen.getByLabelText("Tidak tepat"));
    fireEvent.click(screen.getByRole("button", { name: "Kirim laporan" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("belum aktif"));
    expect(screen.getByRole("button", { name: "Kirim laporan" }).hasAttribute("disabled")).toBe(false);
  });
});
