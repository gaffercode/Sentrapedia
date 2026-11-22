// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AccountMenu } from "../../src/components/account-menu";
import { Sidebar } from "../../src/components/sidebar";
import { initialWorkspace } from "../../src/lib/workspace";

afterEach(cleanup);
const noop = () => undefined;

describe("sidebar order", () => {
  it("lists Glass's six entries in order and no group titles", () => {
    render(<Sidebar state={initialWorkspace} open mobile={false} onToggle={noop} onDialog={noop} onNew={noop} onSelect={noop} onToast={noop}/>);
    const labels = Array.from(screen.getByRole("navigation", { name: "Navigasi utama" }).querySelectorAll(":scope > button, :scope > a")).map(b => b.textContent?.replace(/⌘.*$/, "").trim());
    expect(labels).toEqual(["Baru", "Buat Pasien", "Buat Daftar Pasien", "Mulai Scribe", "Pengaturan Agent", "Cari"]);
    expect(screen.queryByText("Alat kerja")).toBeNull();
  });
  it("opens the scribe dialog from the nav, and Pengaturan Agent is a link to the /agent page", () => {
    const onDialog = vi.fn();
    render(<Sidebar state={initialWorkspace} open mobile={false} onToggle={noop} onDialog={onDialog} onNew={noop} onSelect={noop} onToast={noop}/>);
    fireEvent.click(screen.getByRole("button", { name: "Mulai Scribe" }));
    expect(onDialog.mock.calls).toEqual([["scribe"]]);
    expect(screen.getByRole("link", { name: "Pengaturan Agent" }).getAttribute("href")).toBe("/agent");
  });
});

describe("leaving for the /agent page", () => {
  it("asks the workspace first and stays when it says no", () => {
    const beforeLeave = vi.fn(() => false);
    render(<Sidebar state={initialWorkspace} open mobile={false} onToggle={noop} onDialog={noop} onNew={noop} onSelect={noop} onToast={noop} beforeLeave={beforeLeave}/>);
    const link = screen.getByRole("link", { name: "Pengaturan Agent" });
    expect(fireEvent.click(link)).toBe(false);
    expect(beforeLeave).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /Sentrapedia/ }));
    expect(fireEvent.click(screen.getByRole("menuitem", { name: "Pengaturan Agent" }))).toBe(false);
    expect(beforeLeave).toHaveBeenCalledTimes(2);
  });
  it("goes when the workspace has nothing to lose", () => {
    render(<Sidebar state={initialWorkspace} open mobile={false} onToggle={noop} onDialog={noop} onNew={noop} onSelect={noop} onToast={noop} beforeLeave={() => true}/>);
    expect(fireEvent.click(screen.getByRole("link", { name: "Pengaturan Agent" }))).toBe(true);
  });
});

describe("sidebar account row", () => {
  const sidebar = (props: Partial<ComponentProps<typeof Sidebar>> = {}) => <Sidebar state={initialWorkspace} open mobile={false} onToggle={noop} onDialog={noop} onNew={noop} onSelect={noop} onToast={noop} {...props}/>;
  it("forwards sign-out and the user button into the account menu", () => {
    const onSignOut = vi.fn();
    render(sidebar({ onSignOut, userButton: <span data-testid="user-button"/> }));
    fireEvent.click(screen.getByRole("button", { name: /Sentrapedia/ }));
    expect(screen.getByTestId("user-button")).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "Keluar" }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
  it("names the account after the display name in settings", () => {
    render(sidebar({ state: { ...initialWorkspace, settings: { ...initialWorkspace.settings, name: "dr. Rani Putri" } } }));
    const trigger = screen.getByRole("button", { name: /dr\. Rani Putri/ });
    expect(trigger.querySelector(".avatar")?.textContent).toBe("DR");
    expect(trigger.querySelector(".avatar img")).toBeNull();
  });
  it("shows the Sentraverse mark as the avatar until a display name is set", () => {
    render(sidebar({ state: { ...initialWorkspace, settings: { ...initialWorkspace.settings, name: "" } } }));
    const avatar = screen.getByRole("button", { name: /Sentrapedia/ }).querySelector(".avatar");
    expect(avatar?.querySelector("img")?.getAttribute("alt")).toBe("");
    expect(avatar?.textContent).toBe("");
  });
  it("closes the phone sidebar before opening the chosen dialog", () => {
    const calls: string[] = [];
    render(sidebar({ mobile: true, onToggle: () => calls.push("toggle"), onDialog: (name) => calls.push(`dialog:${name}`) }));
    fireEvent.click(screen.getByRole("button", { name: /Sentrapedia/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Pustaka Klinis" }));
    expect(calls).toEqual(["toggle", "dialog:knowledge"]);
  });
  it("closes the phone sidebar before opening a dialog from the nav, as the account menu does", () => {
    const calls: string[] = [];
    render(sidebar({ mobile: true, onToggle: () => calls.push("toggle"), onDialog: (name) => calls.push(`dialog:${name}`) }));
    fireEvent.click(screen.getByRole("button", { name: "Buat Pasien" }));
    fireEvent.click(screen.getByRole("button", { name: /^Cari/ }));
    expect(calls).toEqual(["toggle", "dialog:patient", "toggle", "dialog:search"]);
  });
  it("never opens a closed phone drawer when a dialog opens", () => {
    const calls: string[] = [];
    render(sidebar({ mobile: true, open: false, onToggle: () => calls.push("toggle"), onDialog: (name) => calls.push(`dialog:${name}`) }));
    fireEvent.click(screen.getByRole("button", { name: "Buat Pasien", hidden: true }));
    expect(calls).toEqual(["dialog:patient"]);
  });
});

describe("account menu", () => {
  it("opens with settings, queue, references, about and sign out", () => {
    const onOpen = vi.fn(), onSignOut = vi.fn();
    render(<AccountMenu name="dr. Rani" plan="Lite" onOpen={onOpen} onSignOut={onSignOut}/>);
    fireEvent.click(screen.getByRole("button", { name: /dr\. Rani/ }));
    expect(screen.getAllByRole("menuitem").map(i => i.textContent)).toEqual(["Pengaturan Agent", "Antrean kerja", "Pustaka Klinis", "Data workspace", "Keluar"]);
    expect(screen.getByRole("menuitem", { name: "Pengaturan Agent" }).getAttribute("href")).toBe("/agent");
    fireEvent.click(screen.getByRole("menuitem", { name: "Antrean kerja" }));
    expect(onOpen).toHaveBeenCalledWith("queue");
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("omits Keluar without a sign-out handler, shows usage when given, and hosts its children", () => {
    render(<AccountMenu name="dr. Rani" plan="Lite" usage={{ used: 3, quota: 10 }} onOpen={noop}><span data-testid="slot"/></AccountMenu>);
    fireEvent.click(screen.getByRole("button", { name: /dr\. Rani/ }));
    expect(screen.queryByRole("menuitem", { name: "Keluar" })).toBeNull();
    expect(screen.getByRole("menu").textContent).toContain("3 dari 10 analisis");
    expect(screen.getByTestId("slot")).toBeTruthy();
  });
  it("moves focus into the menu and walks it with the arrow, Home and End keys", () => {
    render(<AccountMenu name="dr. Rani" plan="Lite" onOpen={noop} onSignOut={noop}/>);
    fireEvent.click(screen.getByRole("button", { name: /dr\. Rani/ }));
    const names = () => screen.getAllByRole("menuitem").map(i => i.textContent);
    const focused = () => document.activeElement?.textContent;
    expect(focused()).toBe(names()[0]);
    const press = (key: string) => fireEvent.keyDown(document.activeElement!, { key });
    press("ArrowDown"); expect(focused()).toBe("Antrean kerja");
    press("End"); expect(focused()).toBe("Keluar");
    press("ArrowDown"); expect(focused()).toBe("Pengaturan Agent");
    press("ArrowUp"); expect(focused()).toBe("Keluar");
    press("Home"); expect(focused()).toBe("Pengaturan Agent");
  });
  it("puts the menu after the trigger and closes when focus leaves it", () => {
    render(<><AccountMenu name="dr. Rani" plan="Lite" onOpen={noop}/><button>luar</button></>);
    const trigger = screen.getByRole("button", { name: /dr\. Rani/ });
    fireEvent.click(trigger);
    expect(trigger.compareDocumentPosition(screen.getByRole("menu")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.blur(screen.getAllByRole("menuitem")[0], { relatedTarget: screen.getByRole("button", { name: "luar" }) });
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("closes on Escape and outside click, returning focus to the trigger", () => {
    render(<><button>luar</button><AccountMenu name="dr. Rani" plan="Lite" onOpen={noop}/></>);
    const trigger = screen.getByRole("button", { name: /dr\. Rani/ });
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByRole("button", { name: "luar" }));
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("today's quota in the account menu", () => {
  const open = (usage?: { used: number; quota: number }) => {
    render(<AccountMenu name="dr. Rani" plan="Lite" usage={usage} onOpen={noop}/>);
    fireEvent.click(screen.getByRole("button", { name: /dr\. Rani/ }));
  };
  it("shows the count and what is left", () => {
    open({ used: 2, quota: 5 });
    expect(screen.getByText("Hari ini 2 dari 5 analisis · sisa 3")).toBeTruthy();
  });
  it("says when the quota is used up", () => {
    open({ used: 5, quota: 5 });
    expect(screen.getByText("Kuota analisis hari ini habis · kembali pukul 07.00 WIB")).toBeTruthy();
  });
  it("shows no usage line without a count", () => {
    open();
    expect(document.querySelector(".account-menu-usage")).toBeNull();
  });
});

describe("sidebar feedback", () => {
  const send = async (status: number, body: unknown, note = "Tombol cetak membantu.") => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify(body), { status }));
    vi.stubGlobal("fetch", fetchMock);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const onToast = vi.fn();
    render(<Sidebar state={initialWorkspace} open mobile={false} onToggle={noop} onDialog={noop} onNew={noop} onSelect={noop} onToast={onToast}/>);
    const box = screen.getByRole("textbox", { name: "Masukan" }) as HTMLInputElement;
    fireEvent.change(box, { target: { value: note } });
    fireEvent.click(screen.getByRole("button", { name: "Kirim masukan" }));
    await vi.waitFor(() => expect(onToast).toHaveBeenCalled());
    const result = { fetchMock, onToast, box, setItem: setItem.mock.calls.filter(([key]) => key === "sentrapedia-feedback") };
    vi.unstubAllGlobals();
    setItem.mockRestore();
    return result;
  };
  it("posts the note and empties the box once it is kept", async () => {
    const { fetchMock, onToast, box, setItem } = await send(200, { status: "ok" });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/feedback");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ note: "Tombol cetak membantu." });
    expect(onToast).toHaveBeenCalledWith("Masukan terkirim. Terima kasih.");
    expect(box.value).toBe("");
    expect(setItem).toEqual([]);
  });
  it("says plainly when the instance cannot keep it, and keeps the text", async () => {
    const { onToast, box } = await send(503, { status: "error", error: { code: "FEEDBACK_UNAVAILABLE" } });
    expect(onToast).toHaveBeenCalledWith("Masukan belum terkirim: penyimpanan belum aktif di instance ini.", "error");
    expect(box.value).toBe("Tombol cetak membantu.");
  });
  it("asks to try again when the store failed to save, and keeps the text", async () => {
    const { onToast, box } = await send(503, { status: "error", error: { code: "FEEDBACK_FAILED" } });
    expect(onToast).toHaveBeenCalledWith("Masukan belum terkirim. Coba kembali.", "error");
    expect(box.value).toBe("Tombol cetak membantu.");
  });
  it("asks to remove identity, and keeps the text", async () => {
    const { onToast, box } = await send(400, { status: "error", error: { code: "IDENTITY" } }, "pasien Tn. Budi");
    expect(onToast).toHaveBeenCalledWith("Masukan memuat pola identitas. Hapus nama, nomor identitas, kontak dan alamat.", "error");
    expect(box.value).toBe("pasien Tn. Budi");
  });
});
