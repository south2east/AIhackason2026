"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Radar } from "@/components/Radar";
import {
  AXES,
  MISSIONS,
  PROMPT_MAX_CHARS,
  TIERS,
  promptScore,
  rankOf,
  totalScore,
  type AxisScores,
  type Coach,
  type FinalJudge,
  type Knowhow,
  type Mission,
  type PromptJudge,
  type Tier,
} from "@/lib/game";

type Turn = {
  id: number;
  prompt: string;
  response?: string;
  truncated?: boolean;
  judge?: PromptJudge;
  coach?: Coach;
  knowhow?: Knowhow;
  error?: string;
};

type Record_ = { total: number; axes: AxisScores; at: number };

const HISTORY_KEY = "bakeru-history-v1";

function loadHistory(): Record<string, Record_[]> {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveHistory(missionId: string, rec: Record_) {
  try {
    const h = loadHistory();
    h[missionId] = [...(h[missionId] ?? []), rec].slice(-20);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
  } catch {}
}

const avgAxes = (turns: Turn[]): AxisScores | null => {
  const js = turns.map((t) => t.judge).filter((j): j is PromptJudge => !!j);
  if (!js.length) return null;
  return Object.fromEntries(AXES.map((a) => [a.key, js.reduce((s, j) => s + j[a.key], 0) / js.length])) as AxisScores;
};

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
  return r.json();
}

const TIER_STYLE: Record<Tier, { card: string; head: string; button: string; badge: string }> = {
  beginner: {
    card: "border-emerald-300 bg-emerald-50",
    head: "bg-emerald-500",
    button: "bg-emerald-500 hover:bg-emerald-600",
    badge: "bg-emerald-500",
  },
  advanced: {
    card: "border-violet/40 bg-violet/5",
    head: "bg-violet",
    button: "bg-violet hover:brightness-110",
    badge: "bg-violet",
  },
};

export default function Home() {
  const [mission, setMission] = useState<Mission | null>(null);
  const [history, setHistory] = useState<Record<string, Record_[]>>({});
  const [tipCount, setTipCount] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistory(loadHistory());
    fetch("/api/knowhow")
      .then((r) => r.json())
      .then((d) => setTipCount(d.items?.length ?? 0))
      .catch(() => {});
  }, []);

  const pick = (m: Mission | null) => {
    setHistory(loadHistory());
    setMission(m);
  };

  if (!mission) return <Landing onPick={pick} tipCount={tipCount} />;
  return <Play key={mission.id} mission={mission} onExit={() => pick(null)} history={history[mission.id] ?? []} />;
}

/* ---------------- Landing ---------------- */

function Landing({ onPick, tipCount }: { onPick: (m: Mission) => void; tipCount: number | null }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-5 px-4 py-6">
      <div className="text-center">
        <p className="text-xs tracking-widest text-muted">BAKERU — みんなでつくるAIノウハウ集</p>
        <h1 className="mt-2 text-3xl font-black leading-tight sm:text-5xl">
          AIは毎月化けている。
          <br />
          <span className="glow">次は人が化ける番だ！</span>
        </h1>
        <p className="mx-auto mt-3 max-w-2xl leading-relaxed text-muted">
          ミッションに挑戦して、<b className="text-foreground">AIからいい答えを引き出す工夫</b>を見つけよう。
          <br className="hidden sm:block" />
          効いた工夫はみんなの<b className="text-lime">ノウハウ集</b>にたまり、CLAUDE.md や Skill として持ち帰れる！
        </p>
      </div>

      {/* How to play */}
      <section className="rounded-2xl border border-dashed border-line bg-panel/60 px-5 py-4" aria-labelledby="howto">
        <div className="flex items-center justify-between gap-3">
          <h2 id="howto" className="text-sm font-bold text-muted">
            遊び方
          </h2>
          <Link href="/knowhow" className="rounded-full border border-lime px-3 py-1 text-xs font-bold text-lime hover:bg-lime hover:text-white">
            みんなのノウハウ集を見る{tipCount !== null ? `（${tipCount}件）` : ""} →
          </Link>
        </div>
        <ol className="mt-2 grid gap-3 sm:grid-cols-3">
          {[
            ["工夫して頼む", "うまくいかなければ頼み方を変えて、もう一度。"],
            ["効いた工夫がノウハウに", "答えが良くなった工夫を、AIが見つけて自動で保存。"],
            ["AI適合度で振り返る", "伝え方を6つの観点で採点。ミッション達成で結果発表。"],
          ].map(([h, t], i) => (
            <li key={h} className="flex gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-white">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-bold">{h}</p>
                <p className="text-xs leading-relaxed text-muted">{t}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
          <span className="mr-1 text-xs font-bold">採点の観点</span>
          {AXES.map((a) => (
            <span key={a.key} title={a.desc} className="rounded-full bg-background px-2.5 py-0.5 text-xs font-bold text-lime">
              {a.label}
            </span>
          ))}
          <span className="ml-auto text-[11px] text-muted">Anthropic / OpenAI のプロンプトガイドにもとづく</span>
        </div>
      </section>

      {/* Level + mission select */}
      <section aria-labelledby="pick">
        <h2 id="pick" className="text-center text-2xl font-black">
          レベルとミッションを選んでスタート！
        </h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {(Object.keys(TIERS) as Tier[]).map((tier) => {
            const t = TIERS[tier];
            const st = TIER_STYLE[tier];
            return (
              <div key={tier} className={`overflow-hidden rounded-2xl border-2 ${st.card}`}>
                <div className={`flex items-baseline justify-between gap-2 px-4 py-2 text-white ${st.head}`}>
                  <span className="text-lg font-black">{t.label}</span>
                  <span className="text-xs">
                    相手: {t.aiName}（{t.modelLabel}）
                  </span>
                </div>
                <p className="px-4 pt-2 text-xs text-muted">{t.desc}</p>
                <div className="grid gap-2 p-4 pt-2">
                  {MISSIONS.filter((m) => m.tier === tier).map((m) => (
                    <button
                      key={m.id}
                      onClick={() => onPick(m)}
                      className="group flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <span className="flex-1">
                        <span className="block text-sm font-bold">{m.title}</span>
                        <span className="block text-xs text-muted">{m.short}</span>
                      </span>
                      <span className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold text-white ${st.button}`}>遊ぶ ▶</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}

/* ---------------- Play ---------------- */

function Play({ mission, onExit, history }: { mission: Mission; onExit: () => void; history: Record_[] }) {
  const tier = TIERS[mission.tier];
  const advanced = mission.tier === "advanced";
  const [turns, setTurns] = useState<Turn[]>([]);
  const [tips, setTips] = useState<Knowhow[]>([]);
  const [openTip, setOpenTip] = useState<Knowhow | null>(null);
  const [input, setInput] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [final, setFinal] = useState<FinalJudge | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Braces matter: scrollIntoView() returns a Promise in recent Chrome, and an effect must not return one.
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length]);

  // Advanced: the coach recommends items from the shared know-how list.
  useEffect(() => {
    if (!advanced) return;
    fetch("/api/knowhow")
      .then((r) => r.json())
      .then((d) => setTips(d.items ?? []))
      .catch(() => {});
  }, [advanced]);

  const showTip = (id: string) => setOpenTip(tips.find((t) => t.id === id) ?? null);

  const update = (id: number, patch: Partial<Turn>) => setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  async function send() {
    const prompt = input.trim();
    if (!prompt || busy) return;
    const id = Date.now();
    const done = turns.filter((t) => t.response !== undefined).map((t) => ({ prompt: t.prompt, response: t.response! }));
    setTurns((ts) => [...ts, { id, prompt }]);
    setInput("");
    setBusy(true);
    await Promise.all([
      post<{ text: string; truncated: boolean }>("/api/ask", { prompt, tier: mission.tier, history: tier.memory ? done : [] })
        .then((r) => {
          update(id, { response: r.text, truncated: r.truncated });
          // Look for a prompt tweak that improved the answer (runs in background).
          if (done.length)
            post<{ found: boolean; knowhow?: Knowhow }>("/api/knowhow/extract", {
              missionId: mission.id,
              previous: done.slice(-3),
              current: { prompt, response: r.text },
            })
              .then((x) => {
                if (x.found && x.knowhow) update(id, { knowhow: x.knowhow });
              })
              .catch(() => {});
        })
        .catch((e) => update(id, { error: String(e.message ?? e) })),
      advanced
        ? post<Coach>("/api/coach", { missionId: mission.id, prompt, history: done.slice(-3) })
            .then((c) => update(id, { coach: c }))
            .catch(() => {})
        : post<PromptJudge>("/api/judge-prompt", { missionId: mission.id, prompt, turn: done.length + 1 })
            .then((j) => update(id, { judge: j }))
            .catch(() => {}),
    ]);
    setBusy(false);
  }

  async function submit() {
    if (!answer.trim() || submitting) return;
    setSubmitting(true);
    try {
      setFinal(await post<FinalJudge>("/api/judge-final", { missionId: mission.id, answer }));
    } finally {
      setSubmitting(false);
    }
  }

  const quote = (text: string) => {
    setInput((v) => `${v}${v ? "\n" : ""}<資料>\n${text.trim()}\n</資料>\n`);
    inputRef.current?.focus();
  };

  const found = turns.filter((t) => t.knowhow).map((t) => t.knowhow!);

  if (final) {
    return <Result mission={mission} turns={turns} final={final} prev={history.at(-1)} onRetry={onExit} />;
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 lg:h-screen">
      {/* Mission */}
      <header className="rounded-2xl border border-line bg-panel px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={onExit} className="text-sm text-muted hover:text-foreground">
            ← 戻る
          </button>
          <span className={`rounded-full px-3 py-0.5 text-sm font-bold text-white ${TIER_STYLE[mission.tier].badge}`}>{tier.label}</span>
          <h1 className="text-xl font-black sm:text-2xl">{mission.title}</h1>
          <span
            className={`ml-auto rounded-full px-4 py-1 text-sm font-bold ${found.length ? "bg-amber-400 text-foreground" : "bg-line text-muted"}`}
          >
            💡 見つけたノウハウ {found.length}件
          </span>
        </div>
        <p className="mt-2 text-base leading-relaxed">{mission.brief}</p>
        <ol className="mt-3 flex flex-wrap gap-2">
          {mission.checklist.map((c, i) => (
            <li key={c} className="rounded-lg bg-background px-3 py-1.5 text-sm">
              <b className="mr-1 text-lime">条件{i + 1}</b>
              {c}
            </li>
          ))}
        </ol>
      </header>

      <div className="grid flex-1 gap-4 lg:min-h-0 lg:grid-cols-2">
        {/* Chat */}
        <section className="flex min-h-[70vh] flex-col rounded-2xl border border-line bg-panel shadow-sm lg:min-h-0">
          <div className="border-b border-line px-5 py-3">
            <p className="text-lg font-bold">① {tier.aiName}に頼む</p>
            <p className="text-sm text-muted">
              {tier.memory ? "会話の流れを覚えています" : "前回までのやり取りを把握していません"}（{tier.modelLabel}）
            </p>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            {turns.length === 0 && (
              <div className="rounded-xl border-2 border-dashed border-line p-5 text-base leading-relaxed text-muted">
                下の<b className="text-foreground">お試しプロンプト</b>を①→②の順に送ってみよう。
                <br />
                頼み方を変えて答えが良くなると、<b className="text-foreground">💡ノウハウ</b>として保存されます。
              </div>
            )}
            {turns.map((t, i) => (
              <TurnView
                key={t.id}
                turn={t}
                n={i + 1}
                aiName={tier.aiName}
                onQuote={tier.memory ? undefined : quote}
                onAdd={(s) => setAnswer((a) => `${a}${a ? "\n\n" : ""}${s.trim()}`)}
                onRetry={(p) => setInput(p)}
                onOpenTip={showTip}
              />
            ))}
            <div ref={bottom} />
          </div>
          <div className="border-t border-line p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-muted">お試しプロンプト:</span>
              {mission.examples.map((ex) => (
                <button
                  key={ex.label}
                  onClick={() => {
                    setInput(ex.prompt);
                    inputRef.current?.focus();
                  }}
                  className="rounded-full border-2 border-violet/40 px-3 py-1 text-sm font-bold text-violet hover:bg-violet/10"
                >
                  {ex.label}
                </button>
              ))}
            </div>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, PROMPT_MAX_CHARS))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
              }}
              rows={3}
              placeholder={`${tier.aiName}へのお願いを書く（Ctrl+Enterで送信）`}
              className="w-full resize-y rounded-xl border-2 border-line bg-background p-3 text-base outline-none focus:border-lime"
            />
            <div className="mt-2 flex justify-end">
              <button
                onClick={send}
                disabled={busy || !input.trim()}
                className="rounded-xl bg-lime px-8 py-2.5 text-lg font-bold text-white transition hover:brightness-110 disabled:opacity-40"
              >
                {busy ? "考え中…" : "送信"}
              </button>
            </div>
          </div>
        </section>

        {/* Answer */}
        <section className="flex min-h-[60vh] flex-col rounded-2xl border border-line bg-panel p-5 shadow-sm lg:min-h-0">
          <p className="text-lg font-bold">② 提出するもの</p>
          <p className="text-sm text-muted">AIの答えの「成果物に追加」で集めて、自由に直してから提出。</p>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            className="mt-3 w-full flex-1 resize-none rounded-xl border-2 border-line bg-background p-4 text-base leading-relaxed outline-none focus:border-violet"
            placeholder="ここに完成品を組み立てる"
          />
          <button
            onClick={submit}
            disabled={submitting || !answer.trim() || turns.length === 0}
            className="mt-3 rounded-xl bg-violet px-5 py-3 text-lg font-bold text-white transition hover:brightness-110 disabled:opacity-40"
          >
            {submitting ? "審査中…" : "提出して AI適合度 を見る"}
          </button>
        </section>
      </div>
      {openTip && <TipModal tip={openTip} onClose={() => setOpenTip(null)} />}
    </main>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 75 ? "bg-lime text-white" : score >= 50 ? "bg-violet text-white" : "bg-line";
  return <span className={`rounded-full px-3 py-0.5 text-sm font-bold ${color}`}>{score}点</span>;
}

function TurnView({
  turn,
  n,
  aiName,
  onQuote,
  onAdd,
  onRetry,
  onOpenTip,
}: {
  turn: Turn;
  n: number;
  aiName: string;
  onQuote?: (s: string) => void;
  onAdd: (s: string) => void;
  onRetry: (s: string) => void;
  onOpenTip: (id: string) => void;
}) {
  const j = turn.judge;
  const c = turn.coach;
  return (
    <div className="space-y-3">
      <div className="ml-auto max-w-[92%] rounded-2xl rounded-tr-sm border border-line bg-background p-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-sm text-muted">あなた · {n}回目</span>
          {j ? (
            <ScoreBadge score={promptScore(j)} />
          ) : c ? (
            <ScoreBadge score={c.score} />
          ) : (
            <span className="text-sm text-muted">採点中…</span>
          )}
        </div>
        <p className="whitespace-pre-wrap text-base">{turn.prompt}</p>
        {c && <CoachView coach={c} onOpenTip={onOpenTip} />}
        {j && (
          <div className="mt-3 border-t border-line pt-2 text-sm leading-relaxed">
            <p>
              <span className="font-bold text-violet">アドバイス:</span> {j.advice}
            </p>
            <details className="mt-1">
              <summary className="cursor-pointer text-muted">詳しい採点とお手本を見る</summary>
              <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5">
                {AXES.map((a) => (
                  <div key={a.key} title={a.source}>
                    <p className="text-xs text-muted">{a.label}</p>
                    <div className="h-2 rounded bg-line">
                      <div className="h-2 rounded bg-lime" style={{ width: `${(j[a.key] / 5) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2">
                <span className="text-lime">◎</span> {j.good}
              </p>
              <p className="mt-2 whitespace-pre-wrap rounded-lg bg-panel p-2">{j.improved}</p>
              <button onClick={() => onRetry(j.improved)} className="mt-2 rounded-lg border border-violet px-2 py-1 text-violet">
                このお手本を入力欄へ
              </button>
            </details>
          </div>
        )}
      </div>
      <div className="max-w-[92%] rounded-2xl rounded-tl-sm bg-line/60 p-4">
        <p className="mb-1 text-sm text-muted">{aiName}</p>
        {turn.error ? (
          <p className="text-base text-red-600">エラー: {turn.error}</p>
        ) : turn.response === undefined ? (
          <p className="animate-pulse text-base text-muted">考え中…</p>
        ) : (
          <>
            <p className="whitespace-pre-wrap text-base">{turn.response}</p>
            {turn.truncated && <p className="mt-1 text-sm text-amber-600">⚠ 途中で切れました。頼む量を減らそう。</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => onAdd(turn.response!)} className="rounded-lg bg-violet px-3 py-1.5 text-sm font-bold text-white hover:brightness-110">
                成果物に追加 →
              </button>
              {onQuote && (
                <button onClick={() => onQuote(turn.response!)} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-lime">
                  次のお願いに貼る
                </button>
              )}
            </div>
          </>
        )}
      </div>
      {turn.knowhow && (
        <div className="max-w-[92%] rounded-2xl border-2 border-amber-400 bg-amber-50 p-4">
          <p className="text-lg font-bold">💡 ノウハウ発見！「{turn.knowhow.title}」</p>
          <p className="mt-1 text-base">{turn.knowhow.tip}</p>
          <p className="mt-1 text-sm text-muted">みんなのノウハウ集に保存しました</p>
        </div>
      )}
    </div>
  );
}

/* ---------------- Result ---------------- */

function Result({
  mission,
  turns,
  final,
  prev,
  onRetry,
}: {
  mission: Mission;
  turns: Turn[];
  final: FinalJudge;
  prev?: Record_;
  onRetry: () => void;
}) {
  const scoreOf = (t: Turn) => (t.judge ? promptScore(t.judge) : (t.coach?.score ?? 0));
  const judged = turns.filter((t) => t.judge || t.coach);
  const promptAvg = judged.length ? Math.round(judged.reduce((s, t) => s + scoreOf(t), 0) / judged.length) : 0;
  const passed = final.items.filter((i) => i.passed).length;
  const achievement = Math.round((passed / mission.checklist.length) * 100);
  const { efficiency, total } = totalScore(promptAvg, achievement, turns.length, mission.idealPrompts);
  const rank = rankOf(total);
  const axes = avgAxes(turns);
  const weakest = axes ? AXES.reduce((w, a) => (axes[a.key] < axes[w.key] ? a : w)) : null;
  const found = turns.filter((t) => t.knowhow).map((t) => t.knowhow!);
  const saved = useRef(false);

  useEffect(() => {
    if (saved.current || !axes) return;
    saved.current = true;
    saveHistory(mission.id, { total, axes, at: Date.now() });
  }, [axes, mission.id, total]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <p className="text-sm text-muted">
        {TIERS[mission.tier].label} · {mission.title} · 結果
      </p>
      <div className="mt-4 grid items-center gap-8 md:grid-cols-[1fr_320px]">
        <div>
          <p className="text-sm text-muted">あなたの AI適合度</p>
          <p className="text-8xl font-black leading-none">
            <span className="glow">{total}</span>
            <span className="text-2xl text-muted"> / 100</span>
          </p>
          {prev && (
            <p className={`mt-2 font-bold ${total >= prev.total ? "text-lime" : "text-muted"}`}>
              前回 {prev.total} → 今回 {total}（{total >= prev.total ? "+" : ""}
              {total - prev.total}）
            </p>
          )}
          <p className="mt-6 text-sm text-muted">化け度</p>
          <p className="text-4xl font-black text-lime">{rank.name}</p>
          <p className="mt-1">{rank.note}</p>

          <div className="mt-6 grid grid-cols-3 gap-3 text-center">
            {[
              ["プロンプト品質", promptAvg, "45%"],
              ["ミッション達成", achievement, "45%"],
              ["効率", efficiency, "10%"],
            ].map(([l, v, w]) => (
              <div key={l} className="rounded-xl border border-line bg-panel p-3">
                <p className="text-xs text-muted">
                  {l}（{w}）
                </p>
                <p className="text-2xl font-bold">{v}</p>
              </div>
            ))}
          </div>
        </div>
        {axes && (
          <div className="flex flex-col items-center rounded-2xl border border-line bg-panel p-4">
            <Radar scores={axes} compare={prev?.axes} />
            {prev && <p className="text-xs text-violet">点線 = 前回のあなた</p>}
          </div>
        )}
      </div>

      <section className="mt-8 rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-lg font-bold">💡 あなたが見つけたノウハウ {found.length}件</p>
          <Link href="/knowhow" className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-bold text-white">
            みんなのノウハウ集へ →
          </Link>
        </div>
        {found.length === 0 ? (
          <p className="mt-2 text-sm text-muted">今回は見つかりませんでした。答えがいまいちなとき、頼み方を変えて再挑戦するとノウハウが生まれます。</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {found.map((k) => (
              <li key={k.id} className="rounded-xl bg-panel p-3 text-sm">
                <b>{k.title}</b>
                <span className="block">{k.tip}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {weakest && axes && (
        <div className="mt-6 rounded-2xl border border-violet bg-violet/10 p-5">
          <p className="text-sm text-violet">次に化けるポイント</p>
          <p className="mt-1 text-xl font-bold">
            「{weakest.label}」を伸ばそう（平均 {axes[weakest.key].toFixed(1)} / 5）
          </p>
          <p className="mt-1 text-sm">{weakest.desc}</p>
          <p className="mt-1 text-xs text-muted">出典: {weakest.source}</p>
        </div>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-line bg-panel p-5">
          <p className="font-bold">
            完成条件 {passed} / {mission.checklist.length}
            {final.demo && <span className="text-xs text-muted">（デモ判定）</span>}
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {mission.checklist.map((c, i) => {
              const it = final.items.find((x) => x.index === i + 1);
              return (
                <li key={c} className="flex gap-2">
                  <span className={it?.passed ? "text-lime" : "text-red-600"}>{it?.passed ? "✔" : "✘"}</span>
                  <span>
                    {c}
                    {it && <span className="block text-xs text-muted">{it.reason}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-sm text-muted">{final.summary}</p>
        </section>
        <section className="rounded-2xl border border-line bg-panel p-5">
          <p className="font-bold">プロンプトの成長</p>
          <div className="mt-4 flex items-end gap-2">
            {judged.map((t, i) => {
              const s = scoreOf(t);
              return (
                <div key={t.id} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-xs">{s}</span>
                  <div className="flex h-24 w-full items-end">
                    <div className="w-full rounded-t bg-gradient-to-t from-violet to-lime" style={{ height: `${Math.max(4, s)}%` }} />
                  </div>
                  <span className="text-[10px] text-muted">{i + 1}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted">
            プロンプト{turns.length}回（目安{mission.idealPrompts}回）
          </p>
        </section>
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <button onClick={onRetry} className="rounded-xl bg-lime px-6 py-3 font-bold text-white">
          もう一度化けに行く
        </button>
      </div>
    </main>
  );
}

/* ---------------- Advanced: coach and know-how ---------------- */

function CoachView({ coach, onOpenTip }: { coach: Coach; onOpenTip: (id: string) => void }) {
  return (
    <div className="mt-3 space-y-2 border-t border-line pt-2 text-sm leading-relaxed">
      <p className="font-bold text-violet">コーチ{coach.demo ? "（デモ）" : ""}</p>
      {coach.matched.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {coach.matched.map((m) => (
            <span key={m.name} title={m.source} className="rounded-full bg-lime/10 px-2 py-0.5 font-bold text-lime">
              ✔ {m.name}
            </span>
          ))}
        </div>
      )}
      <p>
        <span className="text-violet">↑</span> {coach.advice}
      </p>
      {coach.recommend.length > 0 && (
        <div className="space-y-1">
          <p className="text-muted">このノウハウを使うともっと良くなる</p>
          {coach.recommend.map((r) => (
            <button
              key={r.id}
              onClick={() => onOpenTip(r.id)}
              className="block w-full rounded-lg border border-violet/30 bg-violet/5 px-2 py-1.5 text-left hover:border-violet"
            >
              <b>📘 {r.title}</b>
              <span className="block text-muted">{r.reason}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TipModal({ tip, onClose }: { tip: Knowhow; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-panel p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="rounded-full bg-violet/10 px-2 py-0.5 text-[11px] font-bold text-violet">
              {AXES.find((a) => a.key === tip.category)?.label ?? tip.category}
            </span>
            <h3 className="mt-1 text-lg font-bold">💡 {tip.title}</h3>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground" aria-label="閉じる">
            ✕
          </button>
        </div>
        <p className="mt-3 text-sm leading-relaxed">{tip.tip}</p>
        <p className="mt-3 rounded-lg bg-background p-2 text-xs leading-relaxed text-muted">
          改善前: {tip.before}
          <br />
          改善後: {tip.after}
          <br />
          効いた理由: {tip.why}
        </p>
      </div>
    </div>
  );
}
