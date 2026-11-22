"use client";

import { ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import type { DailyUsage } from "../lib/aadi/limits";
import type { DialogName } from "./sidebar";
import { useMenu } from "./use-menu";
import logomark from "../assets/sentraverse-mark.png";

interface Props { name: string; markAvatar?: boolean; plan: "Lite"; usage?: DailyUsage | null; onMenuOpen?: () => void; onOpen: (name: DialogName) => void; onLeave?: (event: { preventDefault: () => void }) => void; onSignOut?: () => void; children?: ReactNode }

// Today's own count against the quota (docs/FEATURE-IDEAS.md idea 3). The day turns at 07.00 WIB (limits.ts).
const usageLine = ({ used, quota }: DailyUsage) => used >= quota ? "Kuota analisis hari ini habis · kembali pukul 07.00 WIB" : `Hari ini ${used} dari ${quota} analisis · sisa ${quota - used}`;

// Pengaturan Agent is a page (/agent); the rest are dialogs of the workspace.
const items: ({ label: string; dialog: DialogName } | { label: string; href: string })[] = [
  { label: "Pengaturan Agent", href: "/agent" },
  { label: "Antrean kerja", dialog: "queue" },
  { label: "Pustaka Klinis", dialog: "knowledge" },
  { label: "Data workspace", dialog: "account" },
];

// The avatar is the Sentraverse mark until the doctor sets a display name (Gaffer, 2026-11-21); then it is their initials.
// The account row at the foot of the sidebar. It opens upward as a menu so the work dialogs that Glass keeps out of the nav stay one tap away.
export function AccountMenu({ name, markAvatar, plan, usage, onMenuOpen, onOpen, onLeave, onSignOut, children }: Props) {
  const { open, setOpen, root, trigger, move, leave, choose } = useMenu();
  useEffect(() => { if (open) onMenuOpen?.(); }, [open, onMenuOpen]);
  return <div className="account-menu" ref={root} onBlur={leave}>
    <button ref={trigger} type="button" className="account" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}><span className="avatar">{markAvatar ? <Image src={logomark} alt="" width={18} height={14} unoptimized aria-hidden="true"/> : name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase()}</span><strong>{name}</strong><span className="lite-badge">{plan}</span><ChevronRight size={15}/></button>
    {open && <div className="account-menu-panel" role="menu" aria-label="Menu akun" onKeyDown={move}>
      {items.map((item) => "href" in item ? <Link key={item.href} role="menuitem" href={item.href} onClick={onLeave}>{item.label}</Link> : <button key={item.dialog} type="button" role="menuitem" onClick={() => choose(() => onOpen(item.dialog))}>{item.label}</button>)}
      {usage && <p className="account-menu-usage" role="none">{usageLine(usage)}</p>}
      {children && <div className="account-menu-slot" role="none">{children}</div>}
      {onSignOut && <button type="button" role="menuitem" onClick={() => choose(onSignOut)}>Keluar</button>}
    </div>}
  </div>;
}
