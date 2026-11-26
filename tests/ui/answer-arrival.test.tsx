// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Conversation } from "../../src/components/workspace-views";
import { smooth } from "../../src/components/smooth";
import type { Encounter, Message } from "../../src/lib/workspace";

const now = new Date().toISOString();
const question: Message = { id: "q1", role: "user", content: "Batuk dan demam sejak 3 hari", mode: "question", createdAt: now };
const answer: Message = { id: "a1", role: "assistant", content: "Jawaban singkat.", mode: "question", createdAt: now };
const encounter = (messages: Message[], id = "enc-1"): Encounter => ({ id, patientId: null, title: "Kasus", createdAt: now, messages, context: "" });
const props = { queuePosition: null, dispatch: () => undefined, onToast: () => undefined, onReuse: () => undefined, onCancel: () => undefined, onOpenDocument: () => undefined };

let scrolled: { element: Element; options: ScrollIntoViewOptions | undefined }[] = [];
beforeEach(() => {
  scrolled = [];
  Element.prototype.scrollIntoView = function (this: Element, options?: boolean | ScrollIntoViewOptions) { scrolled.push({ element: this, options: typeof options === "object" ? options : undefined }); };
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("an answer arriving in the conversation", () => {
  it("is read from its top when it lands in a new encounter, not from the bottom", () => {
    const view = render(<Conversation encounter={undefined} pendingQuestion={question.content} {...props}/>);
    scrolled = [];
    view.rerender(<Conversation encounter={encounter([question, answer])} pendingQuestion={null} {...props}/>);
    const last = scrolled.at(-1);
    expect(last?.element.classList.contains("assistant-message")).toBe(true);
    expect(last?.options?.block).toBe("start");
  });

  it("is read from its top when it lands in an open encounter", () => {
    const view = render(<Conversation encounter={encounter([question, answer])} pendingQuestion={null} {...props}/>);
    view.rerender(<Conversation encounter={encounter([question, answer])} pendingQuestion="Pertanyaan lanjutan" {...props}/>);
    scrolled = [];
    const next = [question, answer, { ...question, id: "q2" }, { ...answer, id: "a2" }];
    view.rerender(<Conversation encounter={encounter(next)} pendingQuestion={null} {...props}/>);
    const answers = view.container.querySelectorAll(".assistant-message");
    expect(scrolled.at(-1)?.element).toBe(answers[answers.length - 1]);
    expect(scrolled.at(-1)?.options?.block).toBe("start");
  });

  it("keeps an opened encounter and a new question at the bottom", () => {
    const view = render(<Conversation encounter={encounter([question, answer])} pendingQuestion={null} {...props}/>);
    expect(scrolled.at(-1)?.element.classList.contains("assistant-message")).toBe(false);
    view.rerender(<Conversation encounter={encounter([question, answer], "enc-2")} pendingQuestion={null} {...props}/>);
    expect(scrolled.at(-1)?.options?.block).toBe("nearest");
    view.rerender(<Conversation encounter={encounter([question, answer], "enc-2")} pendingQuestion="Pertanyaan lanjutan" {...props}/>);
    expect(scrolled.at(-1)?.options?.block).toBe("nearest");
  });
});

describe("the arrival cross-fade", () => {
  it("names its transition while it runs and clears the name when it ends", async () => {
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => { finish = resolve; });
    let update: (() => void) | undefined;
    Object.defineProperty(document, "startViewTransition", { configurable: true, value: (callback: () => void) => { update = callback; return { finished }; } });
    let applied = false;
    smooth(() => { applied = true; }, "arrive");
    expect(document.documentElement.dataset.transition).toBe("arrive");
    update?.();
    expect(applied).toBe(true);
    finish(); await finished; await Promise.resolve();
    expect(document.documentElement.dataset.transition).toBeUndefined();
    delete (document as { startViewTransition?: unknown }).startViewTransition;
  });
});

describe("the reveal of a fresh document", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  it("lets an AADI analysis's sections follow one another in, not only a template's lines", () => {
    expect(css).toContain(".document-studio[data-reveal] :where(.draft-content, .analysis-document) > * { animation: text-in");
    expect(css).toContain(":nth-child(n + 8) { animation-delay: 520ms; }");
  });
  it("switches the reveal off under reduced motion", () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{ \.assistant-message\[data-reveal\], \.document-studio\[data-reveal\] :where\(\.draft-content, \.analysis-document\) > \* \{ animation: none; \}/);
  });
});
