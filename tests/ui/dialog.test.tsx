// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Dialog } from "../../src/components/dialog";

beforeEach(() => {
  // jsdom has no modal dialogs.
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute("open"); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Dialog", () => {
  // A file input fires a bubbling `cancel` when its chooser is dismissed or the same file is picked again.
  it("stays open when a file chooser inside it is cancelled", () => {
    const onClose = vi.fn();
    render(<Dialog title="Konteks" onClose={onClose}><input type="file" aria-label="Unggah berkas"/></Dialog>);
    fireEvent(screen.getByLabelText("Unggah berkas"), new Event("cancel", { bubbles: true, cancelable: true }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on its own cancel (Escape) and keeps the browser from closing it first", () => {
    const onClose = vi.fn();
    const { container } = render(<Dialog title="Konteks" onClose={onClose}><p>Isi</p></Dialog>);
    const event = new Event("cancel", { cancelable: true });
    fireEvent(container.querySelector("dialog") as HTMLDialogElement, event);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });
});
