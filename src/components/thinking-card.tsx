"use client";

import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import type { AnalysisStage, StageEvent } from "../lib/aadi/stage-stream";

// What each gateway stage is doing, in the doctor's words. Only stages the gateway reports are shown.
export const stageLabels: Record<AnalysisStage, string> = {
  retrieve_dx: "Mencari referensi Oracle",
  aadi_dx: "Menyusun diagnosis banding",
  retrieve_tx: "Mencari referensi terapi",
  aadi_tx: "Menyusun usulan terapi",
  gate: "Memeriksa dosis terhadap referensi",
};

/** The latest state of each reported stage, in the order the stages first appeared. */
export function stageProgress(events: readonly StageEvent[]): StageEvent[] {
  const latest = new Map<AnalysisStage, StageEvent>();
  for (const event of events) latest.set(event.stage, event);
  return [...latest.values()];
}

/** The answer's place while the analysis runs. It reports only what has happened: the request went out, each stage the
 *  gateway has reported (when it streams them), and how long the workspace has been waiting. Nothing is predicted. */
export function ThinkingCard({ onCancel, startedAt, stages = [] }: { onCancel: () => void; startedAt?: number; stages?: readonly StageEvent[] }) {
  // The card mounts when the request goes out, so its mount is the start unless the caller knows better.
  const [started] = useState(() => startedAt ?? performance.now());
  const [seconds, setSeconds] = useState(() => elapsed(started));
  useEffect(() => {
    const timer = setInterval(() => setSeconds(elapsed(started)), 1000);
    return () => clearInterval(timer);
  }, [started]);
  const progress = stageProgress(stages);
  const running = progress.some((step) => step.state === "running");
  return <article className="assistant-message thinking-card" aria-busy="true">
    <div role="status" aria-live="polite"><ol className="thinking-steps">
      <li data-done="true"><Check size={12} aria-hidden="true"/><span>Permintaan diterima</span></li>
      {progress.map((step) => step.state === "running"
        ? <li key={step.stage} data-done="false"><span className="thinking-dot" aria-hidden="true"/><span>{stageLabels[step.stage]} · {seconds} dtk</span></li>
        : <li key={step.stage} data-done="true">{step.state === "done" ? <Check size={12} aria-hidden="true"/> : <span className="thinking-skip" aria-hidden="true">–</span>}<span>{stageLabels[step.stage]}{step.state === "failed" ? " · tidak berhasil" : ""}</span></li>)}
      {/* Before the first stage (or from a gateway that sends none) the wait itself is the step; after the last one the
          gateway is assembling the reply. */}
      {!running && <li data-done="false"><span className="thinking-dot" aria-hidden="true"/><span>{progress.length ? "Menyelesaikan jawaban" : "Menunggu jawaban AADI"} · {seconds} dtk</span></li>}
    </ol></div>
    <button type="button" className="text-button" onClick={onCancel}>Batalkan analisis</button>
  </article>;
}

function elapsed(startedAt: number): number {
  return Math.max(0, Math.floor((performance.now() - startedAt) / 1000));
}
