"use client";

import { useEffect, useRef, useState } from "react";
import { catalogueIndex, catalogueMeta, theOracleCategories, theOracleSource, type CatalogueEntry, type Disease } from "../lib/theoracle";
import { readDisease, searchCatalogue } from "../lib/theoracle-client";
import { Dialog } from "./dialog";
import { AadiCaseForm, type AadiAnalysis } from "./aadi-case-form";
import { PixelLoader } from "./pixel-loader";

type Search = { status: "loading" } | { status: "ready"; total: number; items: CatalogueEntry[] } | { status: "error"; message: string };
type Detail = { status: "loading"; id: number } | { status: "ready"; disease: Disease } | { status: "error"; id: number; message: string };

// Search and detail come from /api/theoracle/* (2026-11-18): at most 20 entries per search, one record per click.
export function KnowledgeDialog({ initialTab, onClose, onSave }: { initialTab?: string; onClose: () => void; onSave: (analysis: AadiAnalysis) => void }) {
  const [tab, setTab] = useState(initialTab === "aadi" ? "aadi" : "theoracle");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState<Search>({ status: "loading" });
  const [detail, setDetail] = useState<Detail | null>(null);
  const detailRef = useRef<HTMLElement>(null);
  const meta = catalogueMeta();
  const categories = theOracleCategories();
  useEffect(() => {
    if (tab !== "theoracle") return;
    let current = true;
    const timer = setTimeout(() => searchCatalogue(query, category).then(found => { if (current) setSearch({ status: "ready", ...found }); }, (error: Error) => { if (current) setSearch({ status: "error", message: error.message }); }), 200);
    return () => { current = false; clearTimeout(timer); };
  }, [tab, query, category]);
  const open = (id: number) => {
    setDetail({ status: "loading", id });
    readDisease(id).then(disease => setDetail(now => now?.status === "loading" && now.id === id ? { status: "ready", disease } : now), (error: Error) => setDetail(now => now?.status === "loading" && now.id === id ? { status: "error", id, message: error.message } : now));
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: "nearest" }));
  };
  const selected = detail?.status === "ready" ? detail.disease.id : detail?.id;
  const filter = (next: () => void) => { next(); setSearch({ status: "loading" }); setDetail(null); };
  if (initialTab === "aadi") return <Dialog title="Analisis kasus" subtitle="Tinjau keluhan lalu mulai analisis. Data tambahan bersifat opsional." onClose={onClose}><AadiCaseForm onSave={onSave}/></Dialog>;
  return <Dialog title="Pustaka Klinis" subtitle="Katalog penyakit lokal dan analisis kasus untuk ditinjau klinisi." wide onClose={onClose}>
    <div className="workflow-tabs" role="group" aria-label="Sumber pengetahuan"><button aria-pressed={tab === "theoracle"} onClick={() => setTab("theoracle")}>Penyakit · {catalogueIndex().length} entri</button><button aria-pressed={tab === "aadi"} onClick={() => setTab("aadi")}>Analisis kasus</button></div>
    {tab === "aadi" ? <AadiCaseForm onSave={onSave}/> : <div className="theoracle-catalog">
      <p className="panel-caption">{meta?.sample ? "Katalog contoh: database klinis Sentrapedia tidak terpasang. " : ""}Isi referensi ditinjau klinisi (2026-10-23). Setiap baris dosis menyebut sumber dan halaman pedomannya. {categories.length} kategori pada entri; metadata sumber mendefinisikan {meta?.declaredCategories ?? 0} kategori.</p>
      <div className="queue-filters"><label>Cari penyakit<input aria-label="Cari penyakit" value={query} placeholder="Nama, kode, atau kategori…" onChange={e => filter(() => setQuery(e.target.value))}/></label><label>Kategori<select aria-label="Kategori Oracle" value={category} onChange={e => filter(() => setCategory(e.target.value))}><option value="all">Semua kategori</option>{categories.map(c => <option key={c}>{c}</option>)}</select></label></div>
      {search.status === "loading" ? <PixelLoader label="Mencari di katalog…"/> : search.status === "error" ? <p className="form-warning" role="alert">{search.message}</p> : <>
        <p role="status">{search.total} entri ditemukan{search.total > search.items.length ? ` · ${search.items.length} pertama ditampilkan; persempit pencarian untuk entri lain` : ""}</p>
        <div className="theoracle-list">{search.items.map(d => <button key={d.id} aria-pressed={selected === d.id} onClick={() => open(d.id)}><strong>{d.nama}</strong><span>{d.kode} · {d.kategori}</span></button>)}{!search.items.length && <p className="panel-empty">Tidak ada entri yang cocok.</p>}</div>
      </>}
      {detail?.status === "loading" && <article ref={detailRef} className="theoracle-detail" aria-busy="true"><PixelLoader label="Memuat detail penyakit…"/></article>}
      {detail?.status === "error" && <article ref={detailRef} className="theoracle-detail"><p className="form-warning" role="alert">{detail.message}</p></article>}
      {detail?.status === "ready" && <DiseaseDetail disease={detail.disease} version={meta?.version ?? ""}/>}
    </div>}
  </Dialog>;
}

function DiseaseDetail({ disease, version }: { disease: Disease; version: string }) {
  return <article key={disease.id} className="theoracle-detail"><h3>{disease.nama}</h3><p>{disease.kode} · {disease.kategori} · Record {disease.id}</p><p className="form-warning">Referensi ditinjau klinisi (2026-10-23). Narasi terapi di bawah adalah isi sumber, bukan resep untuk kasus tertentu.</p>{([["definisi", "Definisi"], ["gejala", "Gejala"], ["diagnosis", "Diagnosis (narasi sumber)"], ["terapi", "Terapi (narasi sumber)"], ["rujukan", "Rujukan (narasi sumber)"]] as const).map(([key, title]) => <section key={key}><h4>{title}</h4>{key === "gejala" ? <ul>{disease.gejala.map((g, i) => <li key={i}>{g}</li>)}</ul> : <p>{disease[key]}</p>}</section>)}<details><summary>Sumber dan batas kelengkapan</summary><p>{theOracleSource.file} · ID {disease.id} · versi {version}</p><p className="source-hash">SHA-256: {theOracleSource.hash}</p><p>Pemeriksaan fisik, diagnosis banding, kriteria diagnosis, penunjang dan KIE belum tersedia sebagai bidang terpisah yang terverifikasi. Daftar referensi umum bukan kutipan per penyakit.</p></details></article>;
}
