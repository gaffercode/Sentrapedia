// @vitest-environment jsdom
// Fixes from the 2026-11-26 design audit (recommendations 1-4). jsdom computes no layout, so CSS rules are read from
// globals.css as text, as tests/design-tokens.test.ts does; the rendered result was checked in a browser separately.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Composer } from "../../src/components/composer";
import { initialWorkspace } from "../../src/lib/workspace";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** The bodies of every `@media <query>` block, found by counting braces. */
function media(query: string) {
  const bodies: string[] = [];
  let from = 0;
  for (;;) {
    const at = css.indexOf(`@media ${query}`, from);
    if (at < 0) return bodies.join("\n");
    const open = css.indexOf("{", at);
    let depth = 1, i = open + 1;
    for (; depth && i < css.length; i++) depth += css[i] === "{" ? 1 : css[i] === "}" ? -1 : 0;
    bodies.push(css.slice(open + 1, i - 1));
    from = i;
  }
}
/** Declarations of the rules whose selector list contains `selector`, in `source` (all of globals.css by default, media blocks included). */
function rules(selector: string, source = css) {
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectors.split(",").map((s) => s.trim()).includes(selector))
    .map(([, , body]) => body).join(";");
}

const noop = () => undefined;
beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); });
afterEach(cleanup);
const composerProps = (overrides: Partial<ComponentProps<typeof Composer>> = {}): ComponentProps<typeof Composer> => ({
  prompt: "", onPrompt: noop, mode: "question", onMode: noop, settings: initialWorkspace.settings, onModel: noop, context: "", onContext: noop, onScribe: noop,
  templates: [], favorites: [], templateKey: null, onTemplate: noop, onSubmit: noop, busy: false, ...overrides,
});

describe("mode chips stay discoverable on a phone (audit H1)", () => {
  it("wraps the chip row instead of clipping it at 760px and below", () => {
    const phone = rules(".chip-row", media("(max-width: 760px)"));
    expect(phone).toMatch(/flex-wrap:\s*wrap/);
    expect(phone).toMatch(/mask-image:\s*none/);
    expect(phone).toMatch(/overflow-x:\s*visible/);
  });
});

describe("analysis error offers clear recovery (audit H3)", () => {
  it("keeps the message and the recovery actions apart, with the actions as buttons", () => {
    render(<Composer {...composerProps({ prompt: "demam 3 hari", aadiEnabled: true, analysisError: "Layanan analisis belum tersambung.", onFallback: noop })}/>);
    const alert = screen.getByRole("alert");
    expect(alert.querySelector(".form-warning-message")?.textContent).toBe("Layanan analisis belum tersambung.");
    const actions = alert.querySelector(".form-warning-actions");
    expect(actions).toBeTruthy();
    const buttons = [...actions!.querySelectorAll("button")];
    expect(buttons.map((b) => b.textContent)).toEqual(["Coba lagi", "Susun draf SOAP lokal"]);
    for (const button of buttons) expect(button.classList.contains("button")).toBe(true);
  });

  it("shows only the message when there is nothing to retry", () => {
    render(<Composer {...composerProps({ prompt: "", aadiEnabled: true, analysisError: "Layanan analisis belum tersambung." })}/>);
    expect(screen.getByRole("alert").querySelector(".form-warning-actions")).toBeNull();
  });

  it("lays the actions out as their own row", () => {
    expect(rules(".form-warning-actions")).toMatch(/display:\s*flex/);
  });
});

describe("focus is visible on every field (audit H2)", () => {
  it("rings the composer and the feedback field with the 2px focus outline, not only a border colour", () => {
    expect(rules(".composer:focus-within")).toMatch(/outline:\s*2px solid var\(--workspace-focus\)/);
    expect(rules(".feedback:focus-within")).toMatch(/outline:\s*2px solid var\(--workspace-focus\)/);
  });
  it("gives links and selects the same ring as buttons", () => {
    expect(rules("a:focus-visible")).toMatch(/outline:\s*2px solid var\(--workspace-focus\)/);
    expect(rules("select:focus-visible")).toMatch(/outline:\s*2px solid var\(--workspace-focus\)/);
  });
});

describe("touch targets on a phone reach --target-min (audit S1)", () => {
  it("raises sidebar rows and small icon buttons to 44px at 760px and below", () => {
    const phone = media("(max-width: 760px)");
    for (const selector of [".main-nav > button", ".main-nav > a", ".small-icon", ".submenu-heading > button:first-child", ".sidebar .icon-button", ".empty-text", ".feedback", ".submenu-item > button:first-child"]) {
      expect(rules(selector, phone), selector).toMatch(/min-height:\s*var\(--target-min\)/);
    }
    for (const selector of [".small-icon", ".sidebar .icon-button", ".feedback button"]) expect(rules(selector, phone), selector).toMatch(/min-width:\s*var\(--target-min\)/);
    // Encounter rows: one row height drives the row, its tree line and the active-branch indicator, so they stay aligned.
    expect(rules(":root", phone)).toMatch(/--submenu-row:\s*var\(--target-min\)/);
    expect(rules(".submenu-item")).toMatch(/height:\s*var\(--submenu-row\)/);
    // The grey elbow ends at the row centre, where the active branch ends too.
    expect(rules(".submenu-item::after")).toMatch(/top:\s*calc\(var\(--submenu-row\) \/ 2 - 8px\)/);
  });
  it("draws the active branch from the row height, not a fixed 34px", async () => {
    const { SidebarSubmenu } = await import("../../src/components/sidebar-submenu");
    const { container } = render(<SidebarSubmenu initialSection="e" sections={[{ id: "e", title: "Semua Encounter", selectedId: "b", items: [{ id: "a", label: "A", onSelect: noop }, { id: "b", label: "B", onSelect: noop }] }]}/>);
    const branch = container.querySelector<HTMLElement>(".submenu-active-branch");
    expect(branch?.style.height).toBe("calc(1 * var(--submenu-row) + var(--submenu-row) / 2)");
  });
});

describe("overlays fit their screen (audit D1, D2)", () => {
  it("opens the / picker below the composer on the home view, where the space above is short", () => {
    const home = rules(".home-content .slash-picker", media("(min-width: 761px)"));
    expect(home).toMatch(/top:\s*calc\(100% \+ 4px\)/);
    expect(home).toMatch(/bottom:\s*auto/);
  });
  it("stacks dialog actions full width at 600px and below, in DOM order so focus order matches what is seen", () => {
    const phone = media("(max-width: 600px)");
    expect(rules(".dialog-footer", phone)).toMatch(/flex-direction:\s*column(?!-)/);
    expect(rules(".dialog-footer", phone)).toMatch(/align-items:\s*stretch/);
    expect(rules(".dialog-footer .push-left", phone)).toMatch(/margin:\s*0/);
  });
});
