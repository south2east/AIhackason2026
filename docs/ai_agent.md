# AI Agent 実戦ガイド — 作品に組み込む設計 ＋ コーディングエージェントで3時間で作り切る

> 対象: 全日本AIハッカソン 2026 決勝（2026-11-07 土, 11:30–14:30, 2人チーム）
> 調査日: 2026-11-02。モデルIDやSDKは変わりやすいので、実装前に公式ドキュメントで確認すること。
> 関連: `physical_ai_vlm.md`（VLMで実物を狙い通りに動かす手法、toio の実装メモ）
>
> **コーディングエージェントへ:** Part A は作品に組み込むエージェントの設計指針とコード、Part B は人間と開発を進めるときの約束事。構成は Next.js（フロント）＋ FastAPI（Python バックエンド）。APIキーはバックエンドの環境変数にだけ置く。

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
6. マルチエージェントは**演出としては強いが、壊れやすい**。使うなら役割を固定した直列パイプラインにする。
7. 開発では、**API契約（JSON）を最初の15分で決め、2人とそれぞれのコーディングエージェントが境界の両側を並行して作る**。
8. **30分ごとに結合し、動いたらすぐ commit。** 終了30分前に機能追加を止め、デモ練習に回す。

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

## A7. マルチエージェントは慎重に

- Anthropic の調査系マルチエージェントは、**並列に調べられる広いタスク**で効果が出た。一方でトークン消費は大きい。
- Cognition「Don't Build Multi-Agents」は、文脈の共有が切れて**判断が食い違う**問題を指摘している。
- 論文「Why Do Multi-Agent LLM Systems Fail?」では、失敗の多くが**仕様の曖昧さ、エージェント間の連携の失敗、検証の不足**に分類された。
- **ハッカソンでの落としどころ:** キャラクターが議論する演出（例: 3人の審査員AI、賛成派と反対派）は、**役割と発言順を固定**し、司会役のコードが順番に呼び出す。自由に会話させない。

## A8. 音声・リアルタイム

- 音声で双方向に対話するなら、各社のリアルタイムAPIを使う: Gemini Live（`gemini-3.8-live`）、OpenAI Realtime（`gpt-realtime-2.1` など）、`gpt-live-1`。
- 割り込み、遅延、マイクの権限（HTTPS が必須）でハマりやすい。時間がなければ、**ブラウザで録音→文字起こし→LLM→読み上げ**の直列構成のほうが確実。

## A9. 「AI活用度」が伝わる UI

- **経過のタイムライン:** `🔍 look → 🤖 move_robot(200,310) → ✅ arrived → 💬 報告` の形で、ツール呼び出しを1行ずつ表示する。
- **判断理由の吹き出し:** 構造化出力の `reasoning` を表示する。
- **自己評価の点数グラフ:** A6 のループの点数を表示する。
- **ストリーミング:** 最初の表示まで1秒以内にする。待ち時間に何も出ない画面は「止まっている」と思われる。

## A10. 安全装置（デモを止めないために）

- ステップの上限、全体のタイムアウト、同じツール・同じ引数が3回続いたら停止する。
- APIエラーやレート制限のときに表示する文言と、**ダミー応答で動き続けるデモモード**（環境変数で切り替え）を用意する。
- 実機を動かす操作は範囲内に丸め、緊急停止ボタンを付ける。
- API料金: 会期中だけ使うキーを作り、上限を設定しておく。

## A11. FastAPI → Next.js へのストリーミング（SSE）

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

# Part B: コーディングエージェントで3時間で作り切る

## B1. 当日のタイムライン（11:30–14:30）

| 時刻 | やること | 担当 |
|---|---|---|
| 11:30–11:45 | テーマを解釈し、アイデアを3案出して1案に絞る。審査基準の4項目でそれぞれ採点（AIにブレストさせ、人が決める） | 2人 |
| 11:45–12:00 | **1枚の仕様**を作る: 画面、API契約（JSONの形）、デモの流れ（3分）。これを `CLAUDE.md` に貼る | 2人 |
| 12:00–13:30 | 並行して実装。**30分ごと（12:30 / 13:00 / 13:30）に結合**し、動いたら commit | A: フロント・ハード ／ B: バックエンド・AI |
| 13:30–14:00 | 結合、デプロイ、**提出URLで動くか確認**（HTTPS、APIキー、CORS） | 2人 |
| 14:00–14:20 | **機能追加を止める。** デモ練習（3分で2回）、バックアップ録画、手動モードの確認 | 2人 |
| 14:20–14:30 | URLを提出、予備の確認 | 2人 |

## B2. 事前準備チェックリスト（前日まで）

- [ ] 使うAIサービスの**APIキーを発行し、残高とレート制限を確認**。Gemini Robotics-ER を使うなら、キーに利用制限を設定する（制限なしのキーは 403 になる）。
- [ ] **デプロイ経路の予行練習:** 空の雛形で「URLを開く → バックエンドのAPIが応答する」まで通す（Vercel + Python バックエンド）。
- [ ] Web Bluetooth・カメラ・マイクを**審査に使うPCのChromeで**動作確認（toio があれば接続まで）。
- [ ] この2つの `.md` と `CLAUDE.md` の雛形を手元に置き、当日すぐエージェントに読ませられるようにする。
- [ ] 持ち込みについて: レギュレーションに明記はないが、**事前の作り込みは評価されない**。雛形は汎用の部分（デプロイ設定、接続処理、UIの骨組み）にとどめ、テーマに関わる部分は当日作る。不安なら事務局に確認する。
- [ ] 会場の回線が不安定な場合に備えて、テザリングを準備する。

## B3. `CLAUDE.md` の雛形（当日、仕様を書き足して使う）

```markdown
# プロジェクト: {作品名}（全日本AIハッカソン2026 決勝 / テーマ: {テーマ}）

## ゴール
- 3分のデモで「{一言の価値}」を審査員が体験できること。
- 締切 14:30。14:00 以降は新機能を追加せず、バグ修正のみ。

## 構成
- frontend/: Next.js (App Router, TypeScript)。Chrome で動く。Web Bluetooth・カメラ使用。
- backend/: FastAPI (Python)。LLM/VLM 呼び出しはここだけ。APIキーは環境変数。
- 参考資料: docs/ai_agent.md, docs/physical_ai_vlm.md

## API 契約（変更するときは必ず人間に確認）
POST /decide  req: {...}  res: {...}
POST /agent   SSE: {"type": "say"|"tool_call"|"tool_result"|"done"|"error", ...}

## ルール
- 既存ファイルを全面的に書き換えない。差分は最小にする。
- 1つの変更ごとに「動作確認の方法」を示し、自分で実行できるものは実行して確かめる。
- 新しいライブラリを追加するときは、理由を1行で書く。
- APIキーを frontend に置かない（NEXT_PUBLIC_ に入れない）。
- 分からない仕様は推測で実装せず、TODO コメントを残して報告する。
```

## B4. 指示の出し方

- **まず計画を立てさせる:** 「まず計画だけ出して。コードはまだ書かないで」（Claude Code なら plan mode）。計画を人がレビューしてから実装させる。
- **完了条件を書く:** 「`/decide` を実装。完了条件: `curl -X POST ... ` で `{"decision": {...}}` が返る」
- **小さく区切る:** 1回の指示は15分以内に終わる大きさにする。終わったら動作を確認して commit。
- **資料を読ませる:** 「`docs/physical_ai_vlm.md` の §6.3 の toio.ts を使って接続ボタンを作って」のように、場所まで指定する。
- **画面のずれは見せて直す:** スクリーンショットを渡して「この部分をこうして」と指示する。
- **デバッグの頼み方:** 「エラーは以下。原因の仮説を3つ挙げ、可能性の高い順に1つずつ確かめて」
- **行き詰まったら戻す:** 同じバグに15分以上かかったら、前の commit に戻すか、その機能を諦める判断をする。
- **文脈をリセットする:** 別のタスクに移るときは会話をリセット（Claude Code なら `/clear`）し、CLAUDE.md と資料から読み直させる。

## B5. 2人での並行作業

- **境界は API契約（JSON）で切る。** 最初の15分で決め、両側でモック（ダミーの応答）を作れば、相手を待たずに進められる。
- **ディレクトリを分ける**（`frontend/` と `backend/`）。それぞれのコーディングエージェントが同じファイルを触らないようにする。
- git: こまめに commit し、30分ごとに結合する。同じリポジトリで作業を分けるなら `git worktree` を使うと衝突しにくい。
- 片方が詰まったら、もう片方は**デモの台本とUIの見た目**を進める（3分の見せ方は最後に効いてくる）。

## B6. よくあるハマりどころ

| 症状 | 原因 | 対処 |
|---|---|---|
| Web Bluetooth が動かない | HTTP で配信している、ユーザー操作の外で呼んでいる、iPhone を使っている | HTTPS（または localhost）、ボタンのクリックから呼ぶ、Android か PC の Chrome を使う |
| デプロイ後だけ失敗する | 環境変数を設定していない、CORS、バックエンドのURLの誤り | 本番の環境変数を確認、CORS を許可、`NEXT_PUBLIC_API_BASE` を確認 |
| 401 / 403 | キーの誤り、Gemini ER に制限なしのキーを使った | キーを確認、制限を設定 |
| 400（Claude） | `temperature` を送った、`tool_choice` で強制した、思考を無効にした（Opus 5.5） | A2 の注意を参照 |
| 429 | レート制限 | 並列数を下げる、デモモードに切り替え |
| モデルが見つからない | モデルIDの間違い・廃止 | 公式のモデル一覧で確認（例: `gemini-robotics-er-1.6-preview` は廃止済み） |
| エージェントがファイルを丸ごと書き換えて壊す | 指示が曖昧 | CLAUDE.md に「差分は最小」と書く、こまめに commit して戻せるようにする |
| JSON の解析に失敗 | 構造化出力を使っていない | 構造化出力を使い、Pydantic で検証。失敗したら1回だけ再試行 |

## B7. そのまま使える指示文

- 「テーマは『{テーマ}』。審査基準は①テーマ適合 ②実装度 ③チャレンジ精神 ④AI活用度。3時間・2人・Chromeで動くWebアプリという条件で作れる案を5つ。各案に4基準の点数（各5点）と、一番のリスクを付けて」
- 「選んだ案の 1枚仕様（画面3つまで、API契約のJSON、3分デモの台本）を作って。CLAUDE.md に貼れる形式で」
- 「backend に /decide のモックを作って。契約どおりの固定JSONを返すだけ。完了条件は curl で確認できること」
- 「frontend に、/agent の SSE イベントをタイムライン表示するコンポーネントを作って。type ごとにアイコンを変えて」
- 「デモモードを追加して: 環境変数 DEMO_MODE=1 のとき、LLMを呼ばずに録画済みの応答を順に返す」
- 「この画面のスクリーンショットを見て、審査員が3秒で意味を分かるように見た目を改善して。変更は CSS と文言だけ」

## B8. Claude Code の機能メモ

- `CLAUDE.md`: プロジェクトの約束事（毎回読み込まれる）。`/init` で雛形を作れる。
- plan mode: 計画だけを立てさせるモード（Shift+Tab で切り替え）。
- `/clear`: 会話のリセット。タスクが変わったら使う。
- 作業の中断は Esc。チェックポイントを使えば、前の状態に戻せる（`/rewind`）。
- サブエージェント・スキル・フック・MCP: 必要に応じて使う。ハッカソンでは基本機能だけで十分。
- ドキュメント: https://code.claude.com/docs

---

# Part C: 論文・資料リスト

### C1. エージェントの基礎（推論と行動）

| 論文 | 年 | 一言要約 | 使いどころ |
|---|---|---|---|
| [Chain-of-Thought](https://arxiv.org/abs/2201.11903) | 2022 | 途中の推論を書かせると難しい問題の正答率が上がる | 「理由→答え」の順の出力 |
| [Self-Consistency](https://arxiv.org/abs/2203.11171) | 2022 | 複数の推論を多数決 | 並列化パターン |
| [ReAct](https://arxiv.org/abs/2210.03629) | 2022 | 思考と行動（ツール呼び出し）を交互に繰り返す | **エージェントループの原型（A2）** |
| [Toolformer](https://arxiv.org/abs/2302.04761) | 2023 | LLMがいつどのAPIを呼ぶかを自己学習する | ツール設計の考え方 |
| [Reflexion](https://arxiv.org/abs/2303.11366) | 2023 | 失敗を言葉で振り返り、次の試行に活かす | 改善ループ（A6） |
| [Self-Refine](https://arxiv.org/abs/2303.17651) | 2023 | 自分で評価して改善する反復 | 改善ループ（A6） |
| [Tree of Thoughts](https://arxiv.org/abs/2305.10601) | 2023 | 複数の思考の分岐を探索・評価する | アイデアの探索演出 |
| [Plan-and-Solve](https://arxiv.org/abs/2305.04091) | 2023 | 先に計画を立ててから解く | 計画→実行の分離 |
| [LLMCompiler](https://arxiv.org/abs/2312.04511) | 2023 | 関数呼び出しを依存関係のグラフにして並列実行 | 高速化 |
| [CodeAct](https://arxiv.org/abs/2402.01030) | 2024 | 行動をJSONではなく実行可能なコードで表す | 複雑な操作（安全には注意） |

### C2. 自律エージェントの事例

| 論文 | 年 | 一言要約 | 使いどころ |
|---|---|---|---|
| [Generative Agents](https://arxiv.org/abs/2304.03442) | 2023 | 記憶・振り返り・計画を持つ住人25人の村のシミュレーション | **キャラクター系作品**の設計（記憶の要約、振り返り） |
| [Voyager](https://arxiv.org/abs/2305.16291) | 2023 | Minecraft で自動カリキュラムとスキルライブラリを作りながら成長 | 「できることが増えていく」演出 |
| [SWE-agent](https://arxiv.org/abs/2405.15793) | 2024 | エージェント向けに設計した操作インターフェース（ACI）が性能を左右する | **ツールの設計（A3）** |
| [Agentless](https://arxiv.org/abs/2407.01489) | 2024 | 決まった手順（エージェントにしない設計）でも十分強い | **「エージェントにしない」判断（A1）** |

### C3. マルチエージェント

| 論文・資料 | 年 | 一言要約 |
|---|---|---|
| [CAMEL](https://arxiv.org/abs/2303.17760) | 2023 | 役割を演じる2エージェントの対話でタスクを解く |
| [AutoGen](https://arxiv.org/abs/2308.08155) | 2023 | 会話するエージェントを組み合わせる枠組み |
| [MetaGPT](https://arxiv.org/abs/2308.00352) | 2023 | ソフトウェア開発の工程（SOP）を役割分担で再現 |
| [Why Do Multi-Agent LLM Systems Fail?](https://arxiv.org/abs/2503.13657) | 2025 | 失敗の分類（MAST）。仕様の曖昧さ、エージェント間の連携、検証の不足 |
| [Anthropic: How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) | 2025 | 並列に調べるタスクで効く。トークン消費が大きい |
| [Cognition: Don't Build Multi-Agents](https://cognition.ai/blog/dont-build-multi-agents) | 2025 | 文脈の共有が切れて判断が食い違う問題 |

### C4. 評価

| 論文 | 年 | 一言要約 |
|---|---|---|
| [Judging LLM-as-a-Judge (MT-Bench)](https://arxiv.org/abs/2306.05685) | 2023 | LLMを審査員にする手法と、その偏り（位置、長さ、自分の出力の優遇） |

### C5. 実務ガイド（まずこれを読む）

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

### C6. 公式ドキュメント（当日すぐ引く用）

- Claude ツール利用: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
- Claude 構造化出力: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- Gemini 関数呼び出し: https://ai.google.dev/gemini-api/docs/function-calling
- Gemini モデル一覧: https://ai.google.dev/gemini-api/docs/models
- OpenAI モデル一覧: https://developers.openai.com/api/docs/models
- Claude Code: https://code.claude.com/docs
