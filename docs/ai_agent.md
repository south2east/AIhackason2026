# AI Agent 実戦ガイド — 作品に組み込むエージェントの設計

> 対象: 全日本AIハッカソン 2026 決勝（2026-11-07 土, 11:30–14:30, 2人チーム）
> 調査日: 2026-11-02。モデルIDやSDKは変わりやすいので、実装前に公式ドキュメントで確認すること。
> 関連: `physical_ai_vlm.md`（VLMで実物を狙い通りに動かす手法、toio の実装メモ）
>
> **コーディングエージェントへ:** Part A は作品に組み込むエージェントの設計指針とコード、Part B は論文リスト、付録は実務ガイドと公式ドキュメントへのリンク。構成は Next.js（フロント）＋ FastAPI（Python バックエンド）。APIキーはバックエンドの環境変数にだけ置く。

---

## 0. 前提 — 審査基準とエージェントの関係

- 作品は Chrome から体験できるもの。URLを提出し、審査員が実際に使う。審査は1チーム3分（質疑込み）。
- 審査基準と、エージェント設計で効くところ:

| 審査基準 | ルールの補足 | エージェント設計で効くこと |
|---|---|---|
| テーマ適合 | 事前の作り込みは評価せず、その場で作ったものを評価 | 汎用の雛形は事前に用意し、**テーマに依存する部分（プロンプト、ツール、UI）は当日作る** |
| 実装度 | 動くこと重視。アイデアだけは評価しない | **単純な構成で確実に動かす**。エージェントにしすぎない |
| チャレンジ精神 | 独創的な解決、「ハッカー魂」 | 意外な入出力（実物、音声、カメラ、センサー）や、意外な役割分担 |
| AI活用度 | AIをどれだけ活用しているか | **AIが何をしているかを画面で見せる**（ツール呼び出しの経過、判断理由、自己評価） |

---

## 1. TL;DR

1. **最初は「エージェントにしない」設計を考える。** 決まった処理の流れ（ワークフロー）で済むならそれが一番確実。
2. エージェントにするなら、**ツールは3〜5個、ループは最大5〜8回、全体のタイムアウトを付ける**。
3. **出力は構造化する（JSON Schema）。** UIはそのJSONを描画するだけにする。
4. **AIの経過をストリーミングで画面に出す**（SSE）。待ち時間がそのまま「AI活用度」の見せ場になる。
5. **生成→評価→改善のループ**（評価役のAIを置く）は、短いコードで「AI活用度」と品質を同時に上げられる。

---

# Part A: 作品に組み込むエージェントの設計

## A1. パターン選び（Anthropic「Building effective agents」の分類）

| パターン | 中身 | 3時間での難度 | デモ映え | 作品の例 |
|---|---|---|---|---|
| 単発呼び出し | 1回のLLM呼び出し＋構造化出力 | ★ | △ | 写真→判定→表示 |
| **プロンプトの連鎖** | A の出力を B に渡す（各段で検証） | ★ | ○ | 観察→企画→台本→音声 |
| ルーティング | 入力を分類して専用の処理へ振り分け | ★ | ○ | 話しかけた内容で別キャラが応答 |
| 並列化 | 同じ問いを並列実行して多数決、または観点別に並列実行 | ★★ | ○ | 3人の審査員AIが同時に採点 |
| オーケストレーター＋ワーカー | 司令役がタスクを分け、担当に配る | ★★★ | ◎ | 調査・制作・検証の分業 |
| **評価者＋改善者** | 生成→評価→改善を基準を満たすまで繰り返す | ★★ | ◎ | 作品を自己採点して直す様子を見せる |
| 自律エージェント | ツールを使いながらLLMが自分で手順を決めて動く | ★★★ | ◎ | ロボットや画面を自律的に操作 |

**3時間なら:** 「連鎖」か「評価者＋改善者」を土台にし、必要な部分だけを小さな自律ループにするのが、確実さと見栄えのバランスがよい。

## A2. 最小のエージェントループ（Python / Claude、自前ループ）

ツール呼び出しの経過を UI に流したいので、SDK の自動ループではなく**自前のループ**にしている。Gemini（function calling）や OpenAI（Responses API の tools / Agents SDK）でも構造は同じ。

```python
# backend/agent.py
import json, time
import anthropic

client = anthropic.Anthropic()            # 環境変数 ANTHROPIC_API_KEY

SYSTEM = """あなたは {役割} です。ユーザーの目的を達成するために、用意されたツールだけを使って行動します。
- 1回のツール呼び出しで1つのことだけを行う。
- 情報が足りなければ推測せず、ツールで確かめる。
- 完了したら、ユーザー向けの短い報告で終える。"""

TOOLS = [
    {
        "name": "look",
        "description": "カメラの現在の画像を取得し、写っているものを箇条書きで返す。状況が変わったと思ったら呼ぶ。",
        "strict": True,
        "input_schema": {"type": "object", "properties": {}, "required": [], "additionalProperties": False},
    },
    {
        "name": "move_robot",
        "description": "toio をマット上の (x, y) へ移動する。x, y はマット座標（45〜455）。到達結果を返す。",
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {"x": {"type": "integer"}, "y": {"type": "integer"}},
            "required": ["x", "y"], "additionalProperties": False,
        },
    },
]

def run_tool(name: str, args: dict) -> str:
    if name == "look":
        return json.dumps({"objects": ["赤いブロック (x=200,y=310)", "toio A (x=120,y=120)"]}, ensure_ascii=False)  # 実装に差し替え
    if name == "move_robot":
        x = max(45, min(455, args["x"])); y = max(45, min(455, args["y"]))                                    # 範囲内に丸める
        return json.dumps({"result": "arrived", "x": x, "y": y})                                              # 実装に差し替え
    raise ValueError(f"unknown tool {name}")

def run_agent_events(user_text: str, max_steps: int = 8, time_limit_s: float = 60):
    """UI に流すイベントを順に yield する（SSE で送る想定）"""
    messages = [{"role": "user", "content": user_text}]
    t0 = time.time()
    for step in range(max_steps):
        if time.time() - t0 > time_limit_s:
            yield {"type": "error", "text": "時間切れで停止しました"}; return
        resp = client.beta.messages.create(
            model="claude-opus-5-5",
            max_tokens=16000,
            system=SYSTEM,
            tools=TOOLS,
            messages=messages,
            output_config={"effort": "low"},                 # 速度優先（Opus 5.5 の既定は medium）
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",                             # 安全上の理由で断られたらサーバ側で別モデルへ
        )
        if resp.stop_reason == "refusal":
            yield {"type": "error", "text": "モデルが応答を拒否しました"}; return
        messages.append({"role": "assistant", "content": resp.content})   # content はそのまま返す（思考ブロックも含めて）
        for b in resp.content:
            if b.type == "text" and b.text.strip():
                yield {"type": "say", "text": b.text}
        if resp.stop_reason != "tool_use":
            yield {"type": "done"}; return
        results = []
        for b in resp.content:
            if b.type != "tool_use":
                continue
            yield {"type": "tool_call", "name": b.name, "input": b.input}
            try:
                out = run_tool(b.name, b.input)
                results.append({"type": "tool_result", "tool_use_id": b.id, "content": out})
                yield {"type": "tool_result", "name": b.name, "output": out}
            except Exception as e:
                results.append({"type": "tool_result", "tool_use_id": b.id, "content": str(e), "is_error": True})
                yield {"type": "tool_error", "name": b.name, "error": str(e)}
        messages.append({"role": "user", "content": results})           # 結果はまとめて1メッセージで返す
    yield {"type": "error", "text": "ステップ上限に達しました"}
```

> Claude API の注意（2026-11時点）:
> - Opus 5.5 は思考を無効にできない。速さは `effort`（low〜max）で調整する。
> - `tool_choice` で特定ツールを強制（`any` / `tool`）すると 400 エラーになる。`auto` のままプロンプトで誘導する。
> - `temperature` などのサンプリング引数は送らない。
>
> 他の手段: マルチプロバイダ対応の Python ライブラリ [PydanticAI](https://ai.pydantic.dev) / [LiteLLM](https://docs.litellm.ai)、TypeScript なら [Vercel AI SDK](https://ai-sdk.dev)、OpenAI なら [Agents SDK](https://openai.github.io/openai-agents-python/)。

## A3. ツール設計のコツ（Anthropic「Writing effective tools for agents」より）

- **数を絞る（3〜5個）。** 似たツールが多いと選び間違える。
- **名前と説明に「いつ使うか」を書く。** 例:「状況が変わったと思ったら呼ぶ」。
- **引数は enum や整数にし、範囲を説明に書く。** サーバ側でも範囲内に丸める。
- **返り値は短く、意味のある形にする。** 生のログや巨大なJSONを返さない。次の判断に必要な事実だけを返す。
- **エラーは「どう直せばいいか」が分かる文にする。** 例: `x は 45〜455 の範囲で指定してください（受け取った値: 600）`。
- **副作用のあるツール**（実機を動かす、外部に送信する）は1回の呼び出しで小さく動かす。

## A4. コンテキストの組み立て（Anthropic「Effective context engineering」より）

- システムプロンプトは**役割 → 目的 → ルール → 出力形式**の順に短く書く。細かい if-then を並べるより、判断の原則を書くほうが崩れにくい。
- **状態は毎ターン最新のものだけを渡す。** 古い画像や長いログは要約するか捨てる。
- **例（few-shot）は2〜3個で十分。** 典型例と境界のケース（判断できないとき）を入れる。
- 長い対話は、要点だけを持ち越す「メモ欄」を用意する（例: `memory: ["ユーザーは赤が好き"]`）。

## A5. 構造化出力で UI とつなぐ

- LLMが返すJSONを、そのままUIの部品に対応させる（簡易な Generative UI）。例: `{"cards":[{"title":..,"emoji":..,"score":..}], "next_question": ..}` を受け取り、React でカードとして描画する。
- 各社の指定方法: Claude は `output_config.format`、Gemini は `response_format`、OpenAI は `text.format`（コードは `physical_ai_vlm.md` §5.1）。
- スキーマはフラットに、enum を使う。「なし」は番兵値（`-1` や空文字）で表す。

## A6. 生成 → 評価 → 改善（Evaluator-Optimizer / LLM-as-a-Judge）

```
draft = generate(task)
for i in range(3):
    review = judge(draft, rubric)          # {"score": 1-10, "problems": [...], "fix_hint": "..."}
    stream_to_ui(i, draft, review)         # 改善の過程を画面に出す ← 見せ場
    if review.score >= 8: break
    draft = improve(draft, review)
```

- **評価は別の呼び出し・別のプロンプト**にする（生成役に自己採点させると甘くなる）。基準（rubric）は3〜5項目で具体的に書く。
- 元ネタ: Self-Refine、Reflexion、LLM-as-a-Judge（MT-Bench の論文）。
- デモでは「1回目 4点 → 2回目 7点 → 3回目 9点」と点数が上がっていく様子が分かりやすい。

## A7. 音声・リアルタイム

- 音声で双方向に対話するなら、各社のリアルタイムAPIを使う: Gemini Live（`gemini-3.8-live`）、OpenAI Realtime（`gpt-realtime-2.1` など）、`gpt-live-1`。
- 割り込み、遅延、マイクの権限（HTTPS が必須）でハマりやすい。時間がなければ、**ブラウザで録音→文字起こし→LLM→読み上げ**の直列構成のほうが確実。

## A8. 安全装置（デモを止めないために）

- ステップの上限、全体のタイムアウト、同じツール・同じ引数が3回続いたら停止する。
- APIエラーやレート制限のときに表示する文言と、**ダミー応答で動き続けるデモモード**（環境変数で切り替え）を用意する。
- 実機を動かす操作は範囲内に丸め、緊急停止ボタンを付ける。
- API料金: 会期中だけ使うキーを作り、上限を設定しておく。

## A9. FastAPI → Next.js へのストリーミング（SSE）

```python
# backend/main.py（抜粋）
import json
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from agent import run_agent_events

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class AgentReq(BaseModel):
    text: str

@app.post("/agent")
def agent(req: AgentReq):
    def gen():
        for ev in run_agent_events(req.text):
            yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
    return StreamingResponse(gen(), media_type="text/event-stream")
```

```ts
// app/lib/agent.ts（Client Component から呼ぶ）
export async function runAgent(text: string, onEvent: (ev: any) => void) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/agent`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }),
  });
  const reader = res.body!.getReader(); const dec = new TextDecoder(); let buf = "";
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n"); buf = parts.pop()!;
    for (const p of parts) if (p.startsWith("data: ")) onEvent(JSON.parse(p.slice(6)));
  }
}
```

（`NEXT_PUBLIC_API_BASE` はバックエンドのURLなので公開してよい。**APIキーは絶対に `NEXT_PUBLIC_` に入れない**）

---

# Part B: 論文リスト

### B1. エージェントの基礎（推論と行動）

| 論文 | 年 | 要約 | 使いどころ |
|---|---|---|---|
| [Chain-of-Thought](https://arxiv.org/abs/2201.11903) | 2022 | 答えだけでなく途中の推論も書いた例を few-shot で見せると、LLMも推論を書いてから答えるようになり、算数・常識・記号操作の問題の正答率が大きく上がる。効果が出るのは十分に大きなモデル（約1000億パラメータ以上）で、小さなモデルでは効果がない | 「理由→答え」の順の出力 |
| [Self-Consistency](https://arxiv.org/abs/2203.11171) | 2022 | CoT の推論を1本だけ出すのではなく、サンプリングで異なる推論を複数出し、最終的な答えを多数決で決める。追加の学習なしで CoT の正答率をさらに上げられる（算数の GSM8K で +17.9 ポイント）。呼び出し回数のぶんコストは増える | 並列化パターン |
| [ReAct](https://arxiv.org/abs/2210.03629) | 2022 | 「思考（Thought）→ 行動（Action）→ 観察（Observation）」を交互に繰り返すプロンプト形式。行動で Wikipedia 検索などのツールを呼び、その結果を見て次の思考を立てる。推論だけ（CoT）より事実の誤りが減り、行動だけより計画的に動ける。家事を模した ALFWorld と買い物サイトの WebShop では、1〜2個の例だけで模倣学習・強化学習の手法を成功率で34・10ポイント上回った。経過が読めるので人が検証しやすい | **エージェントループの原型（A2）** |
| [Toolformer](https://arxiv.org/abs/2302.04761) | 2023 | LLMが「どのAPIを、いつ、どんな引数で呼ぶか」を自己教師ありで学習する。文章の途中にAPI呼び出しの候補を自分で挿入して実行し、その結果があると続きを予測しやすくなる呼び出しだけを学習データに残す。電卓・QA・検索・翻訳・カレンダーを使えるようになった 6.7B のモデルが、多くのタスクではるかに大きい GPT-3（175B）に匹敵した | ツール設計の考え方 |
| [Reflexion](https://arxiv.org/abs/2303.11366) | 2023 | 試行に失敗したら、エージェントが「何が悪かったか、次はどうするか」を言葉で振り返り、その文章を記憶に入れて次の試行のプロンプトに加える。重みは更新せず、言葉のフィードバックだけで強化学習のように改善する（verbal reinforcement）。コード生成の HumanEval で pass@1 91%（当時の GPT-4 単体は 80%）を達成し、ALFWorld や HotpotQA でも試行を重ねるごとに成功率が上がった | 改善ループ（A6） |
| [Self-Refine](https://arxiv.org/abs/2303.17651) | 2023 | 同じLLMが「生成 → 自分の出力へのフィードバック → それを踏まえた修正」を繰り返す。学習も追加データも不要で、プロンプトだけで実装できる。対話の応答、コードの最適化、感情の書き換えなど7種類のタスクで、1回で生成した出力より平均で約20ポイント良くなった（人の評価と自動評価の両方）。一方、数学の推論では自分の誤りに気づけず、改善は小さかった | 改善ループ（A6） |
| [Tree of Thoughts](https://arxiv.org/abs/2305.10601) | 2023 | CoT を一本道ではなく木に広げる。各段階で複数の「考え」の候補を出し、LLM自身に有望さを評価させ、幅優先・深さ優先で探索する。見込みがなければ戻って別の枝を試す。4つの数から24を作るパズル（Game of 24）で、GPT-4 + CoT の成功率 4% を 74% に上げた。LLMの呼び出し回数は大きく増える | アイデアの探索演出 |
| [Plan-and-Solve](https://arxiv.org/abs/2305.04091) | 2023 | ゼロショット CoT（「ステップごとに考えよう」）の誤りを計算ミス・手順の抜け・問題の取り違えに分類し、手順の抜けを減らすために「まず問題を理解して計画を立て、その計画を順に実行して解こう」と指示するプロンプトを提案した。変数の抽出や途中の計算を明示させる改良版（PS+）は、例を使わないゼロショットで、算数問題では8個の例を見せる few-shot CoT と同程度の精度を出した | 計画→実行の分離 |
| [LLMCompiler](https://arxiv.org/abs/2312.04511) | 2023 | コンパイラの命令の並列化にならい、LLM（Planner）がまず必要な関数呼び出しを依存関係つきのグラフ（DAG）として計画し、依存のない呼び出しを並列に実行する。ReAct のように「考える→1回呼ぶ」を繰り返す方式と比べ、最大 3.7 倍速く、最大 6.7 倍安く、精度も最大で約9%上がった | 高速化 |
| [CodeAct](https://arxiv.org/abs/2402.01030) | 2024 | エージェントの行動を JSON やテキストの決まった形式ではなく、実行できる Python コードで表す。変数・条件分岐・ループが使え、複数のツールを1回の行動で組み合わせられ、既存のライブラリも呼べる。実行時のエラーメッセージを見て自分でコードを直せる。17種類のLLMで比べると、JSON やテキストより成功率が最大20%高かった。任意のコードを実行するので、サンドボックスなどで隔離する必要がある | 複雑な操作（安全には注意） |

### B2. 自律エージェントの事例

| 論文 | 年 | 要約 | 使いどころ |
|---|---|---|---|
| [Generative Agents](https://arxiv.org/abs/2304.03442) | 2023 | LLMで動く25人の住人が暮らす小さな町のシミュレーション。体験をすべて自然言語で残す記憶（memory stream）を、新しさ・重要度・関連度で取り出し、記憶から上位の気づきをまとめる振り返り（reflection）と、1日の予定を細かく分解する計画（planning）に使う。1人が「バレンタインパーティーを開きたい」と思うだけで、招待が住人の間に広まり、当日に何人も集まるといった振る舞いが自然に生まれた。記憶・振り返り・計画のどれを抜いても人らしさの評価が下がった | **キャラクター系作品**の設計（記憶の要約、振り返り） |
| [Voyager](https://arxiv.org/abs/2305.16291) | 2023 | Minecraft の中で GPT-4 が自分で学び続けるエージェント。①今の状況に合った次の課題を出す自動カリキュラム、②できるようになった動作を実行可能なコードとして保存し、説明文で検索して再利用・組み合わせるスキルライブラリ、③実行エラー・環境の反応・自己検証を見てコードを直す反復プロンプト、の3つからなる。従来手法と比べ、集めたアイテムの種類は3.3倍、技術ツリーの段階への到達は最大15.3倍速かった。覚えたスキルは新しいワールドでも使えた | 「できることが増えていく」演出 |
| [SWE-agent](https://arxiv.org/abs/2405.15793) | 2024 | LLMエージェントにソフトウェアの不具合を直させるとき、人間向けのシェルをそのまま使わせるより、エージェント向けに設計した操作インターフェース（ACI: Agent-Computer Interface）を与えたほうが成績が大きく上がることを示した。ACI は、行番号つきで100行ずつ見せるファイルビューア、結果を短くまとめる検索コマンド、構文エラーになる編集をその場で拒否するエディタなどからなり、出力を簡潔にしている。GitHub の実際の issue を解く SWE-bench で 12.5% を解決した（それまでの手法は 3.8%） | **ツールの設計（A3）** |
| [Agentless](https://arxiv.org/abs/2407.01489) | 2024 | LLMに次の行動を自由に決めさせるエージェントを使わず、決まった3段階の手順でバグを直す。①問題の場所の特定（ファイル → クラス・関数 → 編集箇所と段階的に絞る）、②修正パッチの候補を複数生成、③再現テストと既存のテストで候補を選別。単純な手順なのに、SWE-bench Lite で当時のオープンソースのエージェント手法を上回る解決率を、1件あたり1ドル未満の低コストで出した。複雑なエージェントが本当に必要かを先に問うべき、という主張 | **「エージェントにしない」判断（A1）** |

### B3. マルチエージェント

| 論文・資料 | 年 | 要約 |
|---|---|---|
| [CAMEL](https://arxiv.org/abs/2303.17760) | 2023 | 「AIユーザー」と「AIアシスタント」の2つのエージェントに役割を演じさせ、ユーザー役が指示を出し、アシスタント役が実行する対話でタスクを解く枠組み。最初に役割とタスクを与えるプロンプト（inception prompting）で、役割の入れ替わり、指示の繰り返し、終わらない会話といった失敗を抑える。人間はアイデアを1つ出すだけでよい。生成した大量の対話データは、エージェントの振る舞いの分析や学習に使われた |
| [AutoGen](https://arxiv.org/abs/2308.08155) | 2023 | Microsoft のマルチエージェント会話フレームワーク。LLM・人間・ツールを「会話できるエージェント」として同じように扱い、エージェント同士の会話としてアプリを組む（conversation programming）。2者の対話から、司会役がいるグループチャットまで、会話のパターンをコードで定義できる。数学の問題解決、検索で補強した質問応答、コーディングなどの応用例を示した |
| [MetaGPT](https://arxiv.org/abs/2308.00352) | 2023 | ソフトウェア会社の標準作業手順（SOP）をプロンプトに組み込み、プロダクトマネージャー、アーキテクト、プロジェクトマネージャー、エンジニア、QA の役割を流れ作業でつなぐ。エージェント同士は自由に雑談せず、要件定義書や設計書のような決まった形式の文書を受け渡す（共有のメッセージ置き場に出し、必要な役割が購読する）。これで前段の幻覚が後段に連鎖するのを抑え、コード生成のベンチマーク（HumanEval、MBPP）や開発タスクで従来のマルチエージェント手法より高い成績を出した |
| [Why Do Multi-Agent LLM Systems Fail?](https://arxiv.org/abs/2503.13657) | 2025 | 代表的なマルチエージェントフレームワークの実行ログを専門家が分析し、失敗を14種類・3分類にまとめた（MAST）。①仕様と設計の問題（タスクや役割の指定に従わない、同じ手順を繰り返す、終了条件に気づかない）、②エージェント間の食い違い（確認せずに進める、話が脱線する、情報を伝えない、相手の発言を無視する）、③検証と終了の問題（早すぎる終了、検証しない・検証が誤っている）。役割の書き方を直すといった小さな対策では改善が限られ、設計そのものを見直す必要があると結論づけた |
| [Anthropic: How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) | 2025 | Claude の Research 機能の作り方。リード役のエージェントが調査を計画し、複数のサブエージェントを起動して並列に検索させ、結果をまとめる（オーケストレーター＋ワーカー）。社内の評価では単一エージェントより 90.2% 良い結果になった。成績の差の大部分はトークンの使用量で説明でき、マルチエージェントは通常のチャットの約15倍のトークンを使う。並列に調べられる広いタスクに向き、文脈の共有や依存関係が多いタスク（多くのコーディング）には向かない。委任の指示の書き方、ツールの説明、問いの難しさに応じた労力の調整などの教訓も載っている |
| [Cognition: Don't Build Multi-Agents](https://cognition.ai/blog/dont-build-multi-agents) | 2025 | Devin を作る Cognition 社のブログ。長く動くエージェントで一番大事なのは文脈の扱いだとして、①個々のメッセージではなく、それまでの経過全体を共有する、②行動には暗黙の判断が含まれ、判断が食い違うと結果が悪くなる、の2原則を挙げる。タスクを分けてサブエージェントに並列に作らせると、互いの判断が見えないため、見た目や前提の合わない部品ができてしまう。単一のエージェントが直列に動く構成を勧め、文脈が長くなったらLLMで要約・圧縮する |

### B4. 評価

| 論文 | 年 | 要約 |
|---|---|---|
| [Judging LLM-as-a-Judge (MT-Bench)](https://arxiv.org/abs/2306.05685) | 2023 | GPT-4 などの強いLLMを審査員にして、チャットボットの回答を評価する手法を検証した。多ターンの質問80問からなる MT-Bench と、ユーザーが匿名の2モデルの回答を比べて投票する Chatbot Arena を作り、GPT-4 の判定が人の判定と80%以上一致する（人同士の一致率と同程度）ことを示した。偏りとして、先に出された回答を好む位置の偏り、長い回答を好む偏り、自分の出力を好む偏り、数学や推論の採点の弱さを挙げ、提示順を入れ替えて2回評価する、参考解答を与えるなどの対策を示した |

---

# 付録

### 付録1. 実務ガイド（まずこれを読む）

- **Anthropic: Building effective agents**（2024-12）— ワークフローとエージェントのパターン分類。https://www.anthropic.com/engineering/building-effective-agents
- **Anthropic: Effective context engineering for AI agents**（2025）— コンテキストの組み立て方。https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- **Anthropic: Writing effective tools for agents**（2025）— ツール設計。https://www.anthropic.com/engineering/writing-tools-for-agents
- **Anthropic: Claude Code best practices**（2025）— コーディングエージェントの使い方。https://www.anthropic.com/engineering/claude-code-best-practices
- **OpenAI: A practical guide to building agents**（2025, PDF）— https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf
- **12-Factor Agents**（HumanLayer）— 本番向けエージェントの原則。https://github.com/humanlayer/12-factor-agents
- **Model Context Protocol（MCP）**— ツール接続の標準。https://modelcontextprotocol.io
- **Lilian Weng: LLM Powered Autonomous Agents**（2023）— 計画、記憶、ツール利用の整理。https://lilianweng.github.io/posts/2023-06-23-agent/
- **Chip Huyen: Agents**（2025）— 計画、ツール、失敗モードの整理。https://huyenchip.com/2025/01/07/agents.html
- サーベイ: [The Rise and Potential of LLM Based Agents](https://arxiv.org/abs/2309.07864)（2023）

### 付録2. 公式ドキュメント（当日すぐ引く用）

- Claude ツール利用: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
- Claude 構造化出力: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- Gemini 関数呼び出し: https://ai.google.dev/gemini-api/docs/function-calling
- Gemini モデル一覧: https://ai.google.dev/gemini-api/docs/models
- OpenAI モデル一覧: https://developers.openai.com/api/docs/models
- Claude Code: https://code.claude.com/docs
