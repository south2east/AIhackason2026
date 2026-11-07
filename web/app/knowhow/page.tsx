"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AXES, MISSIONS, TIERS, type Knowhow, type Tier, type Tip } from "@/lib/game";

type Filter = "all" | Tier;
type Exported = { filename: string; content: string; count: number };

export default function KnowhowPage() {
  const [items, setItems] = useState<Knowhow[] | null>(null);
  const [tips, setTips] = useState<Tip[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [exported, setExported] = useState<Exported | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/knowhow", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]));
    fetch("/api/tips")
      .then((r) => r.json())
      .then((d) => setTips(d.tips ?? []))
      .catch(() => {});
  }, []);

  const shown = useMemo(() => (items ?? []).filter((k) => filter === "all" || k.tier === filter), [items, filter]);
  const selected = shown.filter((k) => !unchecked.has(k.id));

  const toggle = (id: string) =>
    setUnchecked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function exportAs(format: "claude-md" | "skill") {
    if (!selected.length) return;
    setBusy(format);
    setError("");
    try {
      const r = await fetch("/api/knowhow/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ format, ids: selected.map((k) => k.id) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setExported(d);
    } catch (e) {
      setError(`書き出しに失敗しました: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(null);
    }
  }

  function download(e: Exported) {
    const url = URL.createObjectURL(new Blob([e.content], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = e.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <Link href="/" className="text-sm text-muted hover:text-foreground">
        ← ゲームに戻る
      </Link>
      <h1 className="mt-3 text-3xl font-black">
        みんなの<span className="glow">AIノウハウ集</span>
      </h1>
      <p className="mt-2 text-muted">
        プレイヤーが頼み方を工夫して、AIの答えが実際に良くなった方法だけを集めています。選んで CLAUDE.md や Skill として持ち帰れます。
      </p>

      {tips.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-bold">
            Tips集 <span className="text-sm font-normal text-muted">AIのテクニカルな使い方（web/tips/*.md）</span>
          </h2>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {tips.map((t) => (
              <li key={t.id} id={t.id}>
                <details className="h-full rounded-2xl border border-line bg-panel p-4 shadow-sm">
                  <summary className="cursor-pointer">
                    <span className="mr-2 rounded-full bg-violet/10 px-2 py-0.5 text-[11px] font-bold text-violet">{t.kind}</span>
                    <b>{t.title}</b>
                    <span className="mt-1 block text-xs text-muted">使う場面: {t.when}</span>
                  </summary>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{t.body.replace(/\*\*(.+?)\*\*/g, "$1")}</p>
                  <p className="mt-2 text-[11px] text-muted">出典: {t.source}</p>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="mt-10 text-lg font-bold">みんなが見つけたノウハウ</h2>
      <div className="sticky top-0 z-10 mt-2 flex flex-wrap items-center gap-2 border-b border-line bg-background/90 py-3 backdrop-blur">
        {(["all", "beginner", "advanced"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-sm font-bold ${filter === f ? "bg-foreground text-white" : "border border-line"}`}
          >
            {f === "all" ? "すべて" : TIERS[f].label}
          </button>
        ))}
        <span className="text-sm text-muted">
          {selected.length} / {shown.length}件を選択中
        </span>
        <span className="ml-auto flex gap-2">
          <button
            onClick={() => exportAs("claude-md")}
            disabled={!!busy || !selected.length}
            className="rounded-xl bg-lime px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {busy === "claude-md" ? "まとめ中…" : "CLAUDE.md にする"}
          </button>
          <button
            onClick={() => exportAs("skill")}
            disabled={!!busy || !selected.length}
            className="rounded-xl bg-violet px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {busy === "skill" ? "まとめ中…" : "Skill にする"}
          </button>
        </span>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {items === null ? (
        <p className="mt-8 animate-pulse text-muted">読み込み中…</p>
      ) : shown.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-line p-8 text-center text-muted">
          まだノウハウがありません。ゲームで頼み方を工夫して、最初のノウハウを見つけよう！
        </p>
      ) : (
        <div className="mt-6 space-y-8">
          {AXES.map((ax) => {
            const group = shown.filter((k) => k.category === ax.key);
            if (!group.length) return null;
            return (
              <section key={ax.key}>
                <h2 className="text-lg font-bold">
                  <span className="text-lime">{ax.label}</span>
                  <span className="ml-2 text-sm font-normal text-muted">{ax.desc}</span>
                </h2>
                <ul className="mt-3 grid gap-3 md:grid-cols-2">
                  {group.map((k) => (
                    <li key={k.id}>
                      <label className="flex h-full cursor-pointer gap-3 rounded-2xl border border-line bg-panel p-4 shadow-sm">
                        <input type="checkbox" checked={!unchecked.has(k.id)} onChange={() => toggle(k.id)} className="mt-1 h-4 w-4 accent-[#3a8a0a]" />
                        <span className="flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <b>{k.title}</b>
                            <span className="rounded-full bg-background px-2 text-[11px] text-muted">
                              {TIERS[k.tier].label} · {MISSIONS.find((m) => m.id === k.missionId)?.title ?? k.missionId}
                            </span>
                          </span>
                          <span className="mt-1 block text-sm">{k.tip}</span>
                          <span className="mt-2 block rounded-lg bg-background p-2 text-xs leading-relaxed text-muted">
                            改善前: {k.before}
                            <br />
                            改善後: {k.after}
                            <br />
                            効いた理由: {k.why}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {exported && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" onClick={() => setExported(null)}>
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-panel p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold">
                {exported.filename}（{exported.count}件のノウハウから作成）
              </p>
              <button onClick={() => setExported(null)} className="text-muted hover:text-foreground" aria-label="閉じる">
                ✕
              </button>
            </div>
            <pre className="mt-3 flex-1 overflow-auto whitespace-pre-wrap rounded-xl bg-background p-4 text-sm">{exported.content}</pre>
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => navigator.clipboard?.writeText(exported.content)} className="rounded-xl border border-line px-4 py-2 text-sm font-bold">
                コピー
              </button>
              <button onClick={() => download(exported)} className="rounded-xl bg-foreground px-4 py-2 text-sm font-bold text-white">
                ダウンロード
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
