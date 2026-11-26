"use client";

import { chipLabel, chipShortlist } from "../lib/studio";
import { modes, type ModeId } from "../lib/drafts";
import type { PersonalTemplate } from "../lib/workflow";
import type { Encounter } from "../lib/workspace";
import { modeKind, modeKindLabel } from "../lib/aadi/composer";

/** The shortlist under the composer: one scrollable row, the active mode pressed, every chip off while an analysis runs.
 *  When the active mode is outside the shortlist, or a personal template is active, one extra pressed chip leads the row so the doctor can see what the next answer will be. */
export function ChipRow({ encounter, mode, templateKey, templates, busy, onChip }: { encounter?: Pick<Encounter, "messages">; mode: ModeId; templateKey?: string | null; templates?: PersonalTemplate[]; busy: boolean; onChip: (mode: ModeId) => void }) {
  const template = templateKey ? templates?.find((item) => `template:${item.id}` === templateKey) : undefined;
  const lead = template ? template.name : chipShortlist.includes(mode) ? null : modes.find((item) => item.id === mode)!.label;
  return <div className="chip-row" role="group" aria-label="Mode">
    {/* A template chip only names the active template: choosing a mode here would drop it. */}
    {lead && <button type="button" className="action-chip" aria-pressed="true" aria-disabled={template ? "true" : undefined} disabled={busy} onClick={template ? undefined : () => onChip(mode)}><span>{lead}</span><span className="chip-kind" aria-hidden="true">{modeKindLabel[modeKind(mode, !!template)]}</span></button>}
    {chipShortlist.map((id) => <button key={id} type="button" className="action-chip" aria-pressed={!template && mode === id} disabled={busy} onClick={() => onChip(id)}><span>{chipLabel(id, encounter)}</span><span className="chip-kind" aria-hidden="true">{modeKindLabel[modeKind(id)]}</span></button>)}
  </div>;
}
