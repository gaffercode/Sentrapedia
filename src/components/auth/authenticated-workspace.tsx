"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { catalogueIndexReady, ensureCatalogueIndex } from "../../lib/theoracle-client";
import { WorkspaceApp } from "../workspace";
import { PixelLoader } from "../pixel-loader";
import { SessionBoundary } from "./session-boundary";

// The drafts and the evidence gate read the catalogue index synchronously, so the workspace opens once it is loaded
// from /api/theoracle/index (2026-11-18: the catalogue is no longer part of the page's code).
function CatalogueGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"ready" | "loading" | { error: string }>(() => catalogueIndexReady() ? "ready" : "loading");
  const load = useCallback(() => ensureCatalogueIndex().then(() => setState("ready"), (error: Error) => setState({ error: error.message })), []);
  useEffect(() => { if (!catalogueIndexReady()) void load(); }, [load]);
  if (state === "ready") return children;
  if (state === "loading") return <main className="panel-empty" aria-busy="true"><PixelLoader label="Memuat katalog penyakit…"/></main>;
  return <main className="panel-empty" role="alert"><p>{state.error}</p><button className="button" onClick={() => { setState("loading"); void load(); }}>Coba lagi</button></main>;
}

export function AuthenticatedWorkspace({ userId, local = false }: { userId: string; local?: boolean }) {
  return <CatalogueGate>{local ? <WorkspaceApp principalId={userId}/> : <SessionBoundary userId={userId} menuSlot={(signOut, userButton) => <WorkspaceApp principalId={userId} onSignOut={signOut} userButton={userButton}/>}/>}</CatalogueGate>;
}
