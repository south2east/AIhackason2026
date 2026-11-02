# Physical AI × VLM 実戦ガイド — VLMに「狙い通りに」動いてもらう手法

> 対象: 全日本AIハッカソン 2026 決勝（2026-11-07 土, 11:30–14:30, 2人チーム, ベルサール渋谷ファースト）
> 調査日: 2026-11-02。モデルIDやSDKの書き方は変わりやすいので、実装前に §5 のリンク先で最終確認すること。
>
> **コーディングエージェントへ:** この資料は「カメラ画像などを見たVLMの判断で、実物（toio等）や画面内のものを狙い通りに動かす」ための設計指針とコード断片です。コード断片はそのまま使ってよいが、APIキーは必ずバックエンド（Python）側だけで扱い、フロント（Next.js）の `NEXT_PUBLIC_*` に入れないこと。

---

## 0. 前提 — 決勝ルールとこの資料の範囲

| 項目 | 内容 | 出典 |
|---|---|---|
| 作品 | **Webブラウザ（Google Chrome）から体験できる作品**。終了後にURLを提出 | レギュレーションPDF |
| 審査 | 審査員が実際に作品を使う。1チーム**3分**（質疑込み） | 同上 |
| 審査基準 | ①テーマに沿っているか（事前の作り込みは評価しない） ②実装度（動くこと重視、アイデアのみは評価しない） ③チャレンジ精神 ④AI活用度 | 同上 |
| 機材 | ノートPC 1人1台、スマホ・タブレットは台数無制限。AIサービスは各自契約のもの | 同上 |
| テーマ | ハッカソン開始時に発表 | 同上 |
| 前例 | 予選5th（2026-07-25 東京）で各チームに **toio 2台** を配布。テーマは『夏×toio』『Radical Atoms×円×toio』『友×toio』。審査員はtoio開発者 | [公式レポート](https://www.aifestival.jp/news/japanaihack2026-05) |
| 決勝のハード | **未発表**。toio か別のハードが出る可能性に備える | — |

この資料の範囲: VLM（画像を理解するLLM）を「頭」にして、物理的なもの（主にtoio）を思い通りに動かすための手法。VLA（ロボット制御そのものを学習したモデル）の研究は §9 で概観のみ。

---

## 1. TL;DR — まずこの10個を守る

1. **VLMにモーターを直接握らせない。** VLMは「何をするか・どこへ行くか」だけを決め、移動そのものは決まった動きをするコード（toioなら内蔵の「目標座標へ移動」コマンド）に任せる。
2. **出力は選択肢から選ばせる。** 自由文ではなく enum・番号・関数呼び出しにする。
3. **座標を答えさせるより「印」を選ばせる。** 画像に番号付きの点やグリッドを描いてから渡し、「何番？」と聞く（Set-of-Mark／グリッド重畳）。
4. **構造化出力（JSON Schema）を使い、サーバ側でも検証して範囲内に丸める。** 失敗したら安全側の既定動作（停止）にする。
5. **分かっていることを画像で聞かない。** toioの位置と向きはマット上ならPosition IDで正確に取れるので、テキストでプロンプトに入れる。
6. **座標系をプロンプトで定義する。** 例:「画像の右＝マットのX+、下＝Y+」。インカメラの左右反転に注意。
7. **閉ループにする。** 行動→撮影→「できた？」をVLMに判定させる。ステップ数の上限とタイムアウトは必須。
8. **遅延を前提に設計する。** VLM呼び出しは1回0.5〜数秒かかる。「遅い頭（VLM）＋速い体（ローカル処理）」に分ける。
9. **理由を先に、行動を後に書かせる。** JSONのフィールド順を `reasoning → action` にする。この理由はそのままデモ画面にも出せる。
10. **AIの判断を画面に見せる。** VLMに渡した画像、選んだ印、理由をオーバーレイ表示すると、審査員に「AI活用度」が伝わる。

---

## 2. 基本アーキテクチャ — 遅い頭 ＋ 速い体

```
[カメラ(PC or スマホ)] --JPEG--> [Next.js (Chrome)] --POST /decide--> [FastAPI (Python)]
                                   |    ^                              | 1) 画像に印/グリッドを描く
                                   |    |                              | 2) VLM呼び出し（構造化出力）
                                   |    +------- action JSON ----------+ 3) 検証・丸め・座標変換
                                   v
                    [Web Bluetooth] --> toio（「目標座標へ移動」は toio 自身が実行）
                                   ^
                    Position ID 通知 (x, y, 角度) --> 次のプロンプトにテキストで入れる
```

| 層 | 担当 | 速さ | 例 |
|---|---|---|---|
| 頭（VLM） | 状況の理解、目標の選択、成功判定 | 0.5〜5秒/回 | 「赤いブロックの近くの3番へ行く」 |
| 体（ローカル） | 移動制御、検出、安全停止 | ミリ秒 | toioの目標座標移動、色検出、MediaPipe、タイムアウト |

研究との対応（§9で詳しく）: SayCan（LLMは選択肢から選ぶ）、Inner Monologue（結果を言葉で返す閉ループ）、Gemini Robotics 1.5（考える役ERと動く役VLAの分業）、GR00T N1（遅い System 2 と速い System 1 の二重構造）。どれも同じ考え方で、この資料はそれをハッカソン規模に縮めたもの。

---

## 3. 手法カタログ

### 3.1 行動を選択肢にする（離散アクション／関数呼び出し）

- **何をする:** 行動を `move_to_mark / rotate / stop / say` のような少数の型に限定する。引数も番号や enum にする。
- **効く理由:** VLMは「何をすべきか」の判断は得意だが、連続値（速度・角度・ミリ単位の位置）を正確に出すのは苦手。選択肢にすれば出力が必ず実行可能になる。
- **コツ:**
  - 行動は5種類以内にする。
  - 「何もしない／分からない」を必ず選択肢に入れる。これがないと、見えていないものを見えたことにしやすい。
  - 1回の呼び出しで決めるのは「次の1手」だけにする。
- **元ネタ:** SayCan（LLMが「できること」の一覧から選ぶ）、Code as Policies（用意した関数だけを使う）。

### 3.2 構造化出力 ＋ サーバ側の検証

- スキーマは**フラット**にし、`enum` と整数を使う。「なし」は `-1` のような番兵値で表す。`oneOf` やnull許容の型は各社で対応に差があるので避けると移植しやすい。
- 受け取ったら Pydantic で再検証する。範囲外の値は丸め（clamp）、失敗したら1回だけ再試行し、だめなら `stop` にする。
- 各社の指定方法（§5にコードあり）:
  - Claude: `output_config={"format": {"type": "json_schema", "schema": ...}}`
  - Gemini: `response_format={"type": "text", "mime_type": "application/json", "schema": ...}`（Interactions API）
  - OpenAI: `text={"format": {"type": "json_schema", ...}}`（Responses API）

```python
# schema.py — 3社共通で使える「フラットな」行動スキーマ
from pydantic import BaseModel, Field
from typing import Literal

class Decision(BaseModel):
    observation: str = Field(description="画像から読み取った事実を1〜2文で")
    reasoning: str = Field(description="次の1手を選んだ理由を1〜2文で")
    action: Literal["move_to_mark", "rotate", "stop", "say"]
    mark_id: int = Field(description="move_to_mark の行き先の印番号。使わないときは -1")
    rotate_deg: int = Field(description="rotate の角度（-180〜180）。使わないときは 0")
    speech: str = Field(description="say のときに話す短い言葉。使わないときは空文字")
    done: bool = Field(description="タスクが完了したと判断したら true")

def sanitize(d: Decision, n_marks: int) -> Decision:
    if d.action == "move_to_mark" and not (0 <= d.mark_id < n_marks):
        return d.model_copy(update={"action": "stop", "reasoning": f"不正な印番号 {d.mark_id}"})
    return d.model_copy(update={"rotate_deg": max(-180, min(180, d.rotate_deg))})
```

### 3.3 座標の扱い

VLMに直接座標を出させる場合は、**各社で座標の形式が違う**ことに注意する。

| 提供元 | 座標の形式 | 注意 |
|---|---|---|
| Gemini（Flash系 / Robotics-ER） | 点は **`[y, x]`**、ボックスは `[ymin, xmin, ymax, xmax]`。どちらも 0–1000 に正規化 | **yが先**。画像の幅と高さを掛けて元に戻す |
| Claude（Opus 4.7以降・Sonnet 5以降の高解像度対応モデル） | 送った画像の**ピクセル座標**（長辺2576pxまでなら1:1） | プロンプトで「幅W×高さHの画像、左上が原点、(x, y)で」と明示する。Haikuの解像度上限は要確認 |
| OpenAI（gpt-6系） | 固定の形式なし | 公式ドキュメントに「正確な位置特定は苦手」と明記されている。**印を選ばせる方式（3.4）を推奨** |

```python
def gemini_point_to_px(pt_yx, w, h):
    """Gemini の [y, x] (0-1000) をピクセル (x, y) に変換"""
    y, x = pt_yx
    return int(x / 1000 * w), int(y / 1000 * h)
```

**画像座標 → toioマット座標（ホモグラフィ変換）**

カメラ画像上の点をマットの座標に変換する。真上から撮れば誤差は小さいが、斜めでも4点の対応があれば変換できる。

```python
import numpy as np, cv2

# 校正: toioをマットの4か所に置いて Position ID を読み、同じ場所を画像上でクリックして得る
img_pts = np.float32([[102, 88], [540, 95], [548, 430], [96, 425]])   # 画像上の(u, v)
mat_pts = np.float32([[60, 60], [440, 60], [440, 440], [60, 440]])    # 同じ場所の toio 座標
H, _ = cv2.findHomography(img_pts, mat_pts)

def img_to_mat(u, v):
    x, y = cv2.perspectiveTransform(np.float32([[[u, v]]]), H)[0][0]
    return int(round(x)), int(round(y))
```

> 校正のコツ: 4点はマットの角に近い位置にとる。toioを置いて実測した Position ID を使えば、マットの寸法を知らなくても正確な対応がとれる。

### 3.4 画像に描き込んでから渡す（Visual Prompting）

VLMにとって「座標を数値で出す」より「画像上の番号を選ぶ」ほうがはるかに正確。**ハッカソンで一番効く手法**。

| 手法 | 描くもの | 聞き方 | 向いている場面 | 元ネタ |
|---|---|---|---|---|
| **(a) Set-of-Mark** | 候補の物体や地点に番号付きの丸 | 「目標は何番？」 | 候補を列挙できるとき（色検出、格子点、toio自身） | SoM (2023) |
| **(b) グリッド重畳** | A–H × 1–6 のラベル付きグリッド | 「どのマス？」 | 候補を事前に作れないとき | SCAFFOLD (2024) |
| **(c) 候補の矢印** | ロボットから伸びる番号付き矢印を数本 | 「進むべき矢印は？」→選ばれた方向の周辺で再サンプリング（反復） | 進む方向を決めるとき | PIVOT (2024) |
| **(d) キーポイント** | 物体の上に番号付きの点 | 「押す点・掴む点は？」 | 物体のどこに触れるか | MOKA (2024) |

候補の作り方:
- **色検出:** OpenCV の `inRange` で色ブロックを検出する。
- **2段階:** まず Gemini の pointing で候補を列挙し、次にその番号の中から選ばせる。
- **格子点:** マット上に等間隔の点を置く。
- **既知の位置:** toio自身の位置を印にする。

```python
# marks.py — 番号付きの印とグリッドを描く（Pillow 10.1以降: load_default(size=) を使うため）
from PIL import Image, ImageDraw, ImageFont

def draw_marks(img: Image.Image, points: list[tuple[int, int]]) -> Image.Image:
    im = img.copy(); d = ImageDraw.Draw(im)
    r = max(12, im.width // 50)
    font = ImageFont.load_default(size=r)
    for i, (x, y) in enumerate(points):
        d.ellipse([x - r, y - r, x + r, y + r], fill="white", outline="black", width=3)
        d.text((x, y), str(i), fill="black", font=font, anchor="mm")
    return im

def draw_grid(img: Image.Image, cols=8, rows=6) -> tuple[Image.Image, dict[str, tuple[int, int]]]:
    im = img.copy(); d = ImageDraw.Draw(im)
    cw, ch = im.width / cols, im.height / rows
    font = ImageFont.load_default(size=int(min(cw, ch) / 4))
    centers = {}
    for c in range(cols):
        for r in range(rows):
            label = f"{chr(65 + c)}{r + 1}"  # A1, B3 ...
            x0, y0 = c * cw, r * ch
            d.rectangle([x0, y0, x0 + cw, y0 + ch], outline="yellow", width=2)
            d.text((x0 + 4, y0 + 2), label, fill="yellow", font=font)
            centers[label] = (int(x0 + cw / 2), int(y0 + ch / 2))
    return im, centers   # VLMの答え(例 "C4") → centers["C4"] → img_to_mat()
```

> 印は**目立つ色・大きめ・白地に黒文字**にする。印が対象物を隠すと逆効果なので、半透明にするか物体の横に置く。

### 3.5 閉ループと成功判定

```
for step in range(MAX_STEPS):          # 例: 6
    img = capture()
    state = read_toio_state()          # Position ID など
    decision = vlm_decide(img, state, task, history)
    if decision.action == "stop" or decision.done: break
    execute(decision)                  # 短い行動だけ実行（例: 1地点だけ移動）
    wait_until_arrived_or_timeout()
    verdict = vlm_verify(capture(), task)   # 判定は別のプロンプトで
    history.append((decision, verdict))
```

- **成功判定は行動決定とは別の呼び出しにする。** 同じ呼び出しで判定させると自己評価が甘くなる。判定用のプロンプトは「達成した／まだ／分からない ＋ 理由」の3択にする。
- **止まる条件を必ず入れる:** 最大ステップ数、全体のタイムアウト、同じ行動が3回続いたら停止。
- **履歴は短く渡す:** 直前2〜3手の「行動 → 結果」をテキストで渡す（Inner Monologue型）。
- **元ネタ:** Inner Monologue（成功検知の結果を言語で返す）、REFLECT（失敗を説明させて修正）、AHA（失敗検知に特化したVLM）。

### 3.6 推論を先に、行動を後に書かせる

- JSONのフィールド順を `observation → reasoning → action` にする。モデルは前から順に生成するので、理由を書いてから行動を選ぶことになる。
- ECoT（Embodied Chain-of-Thought）では、行動の前にサブタスクや物体位置を明示して推論させると汎化性能が上がった。
- ただし推論が長いと遅くなる。`reasoning` は「1〜2文」と指定し、モデル側の思考量の設定は低めにする（Claudeは `effort: "low"`、Geminiは `thinking_level` を low〜minimal）。
- 副産物として、`reasoning` をそのままデモ画面の吹き出しに出せる。

### 3.7 分かっていることはテキストで渡す

- 画像から読ませるより、**センサー値をテキストで渡すほうが正確**。VLMは細かい位置関係の読み取りが苦手（§4）。
- 渡すとよいもの: toioの `x, y, 角度`、ボタンや傾きなどのセンサー値、直前の行動とその結果、残り時間。
- 例: `toio A: x=212, y=301, 向き=90°（右向き）。直前: 印3へ移動→到達。`

### 3.8 多数決・平均

- 同じ質問を**並列で3回**投げ、印番号なら多数決、座標なら中央値をとる。並列なので待ち時間はほぼ1回分で済む。
- Gemini Robotics-ER の公式ガイドも、高精度が必要なタスクでは「複数回実行して平均」を推奨している。
- 元ネタ: Self-Consistency（複数の推論経路で多数決）。

### 3.9 切り出し・拡大（クロップ & ズーム）

- 小さい物体や遠くの物体は2段階で見る: まず粗い位置を出させ、その周辺を切り出して拡大し、再度聞く。
- Claude・Geminiの公式ガイドとも、細かいものは切り出しや拡大で精度が上がると明記している。
- 元ネタ: V*（必要な部分を探して拡大するVLM）、Visual Sketchpad（VLMが自分で描き込み・切り出しを行う）。

### 3.10 コード生成で動かす（Code as Policies の縮小版）

- 「円を描いて」「8の字に走って」「2台でダンスして」のような**複雑な動き**は、LLMに**命令の列**を書かせると作りやすい。
- 安全のため Python の `eval` で実行してはいけない。JSONの命令列にして、**自分で書いた小さな解釈器**で実行する（使える命令はホワイトリストで限定）。
- toio には**複数目標の連続移動コマンド（0x04、最大29点）**があるので、LLMに点の列を出させればそのまま滑らかに走らせられる。予選5thのテーマ『円』のようなお題に直結する。

```json
{"program": [
  {"op": "led", "r": 255, "g": 0, "b": 0},
  {"op": "path", "points": [[250,150],[350,250],[250,350],[150,250],[250,150]]},
  {"op": "say", "text": "一周しました"}
]}
```

- 元ネタ: Code as Policies（LLMがロボットAPIを呼ぶコードを書く）、VoxPoser（言語から「行くべき場所／避ける場所」のコストマップを作る）。ハッカソンでは「グリッドのコスト表をLLMに書かせる」くらいに縮めると扱いやすい。

### 3.11 リアルタイム化

- **画像を軽くする:** 長辺512〜768px、JPEG品質0.7程度。変化があったときだけ送る。必要な範囲だけ切り出して送る。
- **モデルを役割で分ける:** 軽いモデル（Flash-Lite、Haiku、luna など）は判定や分類、重いモデルは計画、と分担する。
- **ストリーミングAPIを使う:**
  - Gemini Live（`gemini-3.8-live`）
  - `gemini-robotics-er-2-streaming-preview`（Live API経由。関数呼び出しは使えるが、構造化出力とコード実行は使えない）
  - OpenAI Realtime（`gpt-realtime-2.1` など）

  「声で指示するとロボットが動く」はデモ映えする。
- **速い認識はローカルで:**
  - ブラウザ: MediaPipe（手・ポーズ・物体）
  - Python: OpenCV の色検出、ArUcoマーカー

  VLMは**その検出結果（座標の一覧）をテキストで受け取って判断するだけ**にすると、速くて正確になる。

---

## 4. VLMの苦手と対策

| 苦手なこと | 症状 | 対策 | 根拠 |
|---|---|---|---|
| 左右・鏡像 | インカメラのミラー表示で左右が逆になる | 送る画像は反転しない。座標系をプロンプトで定義する | — |
| 細かい位置・距離 | 「少し右」が曖昧で、座標がずれる | 印やグリッドから選ばせる。数値の状態はテキストで渡す | Eyes Wide Shut, BLINK |
| 数える・重なり | 個数を間違える | 検出はローカル処理に任せ、VLMは解釈だけ | VLMs are Blind |
| 奥行き・3D | 手前と奥を取り違える | **真上から固定で撮る** | SpatialVLM, Thinking in Space |
| 小さい物体 | 見落とす | 切り出し・拡大、解像度を上げる | V* |
| 幻覚 | 無い物を「ある」と言う | 「見えない（not_found）」の選択肢を用意する | Gemini Robotics-ER ドキュメント |
| 遅延 | 1回に数秒かかる | 二層構造、並列化、小さいモデル | — |

**カメラの置き方:** 真上からの固定撮影が最強。スマホをスタンドで真上に固定し、同じWebページをスマホのChromeで開いて「撮影・送信係」にする。`getUserMedia` はHTTPSが必要。iPhoneのSafariでもカメラは使えるが、Web Bluetoothは使えない。

---

## 5. 各社VLM APIの比較（2026-11-02時点）

| | Gemini | Claude | OpenAI |
|---|---|---|---|
| 汎用モデル | `gemini-3.8-flash`（新規推奨）、`gemini-3.5-flash-lite`（軽量）、`gemini-4-argon`（最上位） | `claude-opus-5-5`（既定）、`claude-sonnet-5-5`、`claude-haiku-5-5`（軽量） | `gpt-6-astra`（最上位）、`gpt-6.1-sol`、`gpt-6.1-terra`（高速）、`gpt-6-luna`（最安） |
| 物理・空間推論の専用モデル | **`gemini-robotics-er-2-preview`**（2026-07-30公開。pointing、ボックス、軌道、ロボットの段取り。ER 1.6 は廃止） | なし（汎用モデルで対応） | なし |
| 座標の出力 | 正規化 `[y, x]` 0–1000 | 送った画像のピクセル座標（高解像度モデルは1:1） | 位置特定は苦手と公式に記載 |
| 構造化出力 | `response_format` + schema | `output_config.format`（json_schema）、`strict: true` のツール | `text.format`（json_schema） |
| リアルタイム | Live API（`gemini-3.8-live`、ER 2 streaming） | — | Realtime API（`gpt-realtime-2.1` など） |
| こんなときに | **物の位置を指す・検出する**のが主目的 | 判断・計画・ツール呼び出し・図表の読解 | 音声対話との組み合わせ |
| 注意 | ER系は**利用制限を付けていないAPIキーだと 403** になる（キーに制限を設定する） | 思考は常にオンで、深さは `effort` で調整（Opus 5.5 の既定は `medium`） | 画像の `detail`（low / high / original / auto） |

**おすすめの組み合わせ:**
- 位置を指す・検出する役は Gemini（ER 2 または 3.8 Flash）。
- 判断と行動選択は、印を選ばせる方式（3.4）にすればどのモデルでも安定する。
- 迷ったら「Gemini で候補を列挙 → 印を描く → 好きなモデルで番号を選ぶ」の2段構成にする。

### 5.1 共通アダプタ（Python）

```python
# vlm.py — 画像(JPEG base64) + プロンプト → Decision（schema.py）
import json, os
from schema import Decision

PROVIDER = os.getenv("VLM_PROVIDER", "gemini")   # "gemini" | "claude" | "openai"

def decide(image_b64: str, prompt: str) -> Decision:
    return {"gemini": _gemini, "claude": _claude, "openai": _openai}[PROVIDER](image_b64, prompt)
```

**Claude**（`pip install anthropic`。キーは環境変数 `ANTHROPIC_API_KEY`）

```python
import anthropic
_claude_client = anthropic.Anthropic()

def _claude(image_b64: str, prompt: str) -> Decision:
    resp = _claude_client.beta.messages.create(
        model="claude-opus-5-5",
        max_tokens=16000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",            # 安全上の理由で断られたとき、サーバ側で別モデルにフォールバック
        output_config={
            "effort": "low",            # 速度優先。Opus 5.5 の既定は medium
            "format": {"type": "json_schema", "schema": _strict_schema()},
        },
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": image_b64}},
            {"type": "text", "text": prompt},
        ]}],
    )
    if resp.stop_reason == "refusal":
        return Decision(observation="", reasoning="モデルが応答を拒否", action="stop",
                        mark_id=-1, rotate_deg=0, speech="", done=False)
    text = next(b.text for b in resp.content if b.type == "text")
    return Decision.model_validate_json(text)

def _strict_schema():
    s = Decision.model_json_schema()
    s["additionalProperties"] = False      # json_schema では additionalProperties: false が必要
    return s
```

**Gemini**（`pip install google-genai`。キーは環境変数 `GEMINI_API_KEY`。Interactions API の書き方）

```python
from google import genai
_gemini_client = genai.Client()

def _gemini(image_b64: str, prompt: str) -> Decision:
    interaction = _gemini_client.interactions.create(
        model="gemini-3.8-flash",       # 位置を指すのが主目的なら "gemini-robotics-er-2-preview"
        input=[
            {"type": "text", "text": prompt},                                       # テキストを画像より先に置く（公式推奨）
            {"type": "image", "data": image_b64, "mime_type": "image/jpeg"},        # ※部品の形は公式サンプルで要確認
        ],
        response_format={"type": "text", "mime_type": "application/json",
                         "schema": Decision.model_json_schema()},
        generation_config={"thinking_level": "low"},
    )
    return Decision.model_validate_json(interaction.output_text)
```

> Gemini の「点で指す」プロンプト例（公式より）: `Point to no more than 10 items in the image. The label returned should be an identifying name for the object detected. The points are in [y, x] format normalized to 0-1000.` 出力は `[{"point": [y, x], "label": "..."}]` 形式。

**OpenAI**（`pip install openai`。キーは環境変数 `OPENAI_API_KEY`。Responses API）

```python
from openai import OpenAI
_openai_client = OpenAI()

def _openai(image_b64: str, prompt: str) -> Decision:
    resp = _openai_client.responses.create(
        model="gpt-6.1-sol",
        input=[{"role": "user", "content": [
            {"type": "input_text", "text": prompt},
            {"type": "input_image", "image_url": f"data:image/jpeg;base64,{image_b64}", "detail": "high"},
        ]}],
        text={"format": {"type": "json_schema", "name": "decision",
                         "schema": _strict_schema(), "strict": True}},   # ※ text.format の形は公式で要確認
    )
    return Decision.model_validate_json(resp.output_text)
```

### 5.2 判断用プロンプトのテンプレート

```
あなたは卓上ロボット toio の「頭脳」です。俯瞰カメラの画像と現在の状態を見て、次の1手だけを決めます。

# 画像について
- 画像には番号付きの白い丸（候補地点）が描かれています。行き先は必ずこの番号で指定してください。
- 画像の右がマットのX+、下がY+です。画像は左右反転していません。

# 現在の状態（センサー値。画像より正確です）
- toio A: x={x}, y={y}, 向き={angle}°
- 直前の行動: {last_action} → 結果: {last_result}

# タスク
{instruction}

# ルール
- action は move_to_mark / rotate / stop / say から1つ選ぶ。
- 目標が見えない・判断できないときは action="stop" とし、reasoning に理由を書く。
- observation と reasoning は日本語で各1〜2文。
- タスクが完了していれば done=true。
```

---

## 6. toio を Chrome から動かす（Web Bluetooth）

### 6.1 前提条件

- **HTTPS で配信する**（`localhost` は例外として可）。Vercel のURLならそのままでよい。
- `navigator.bluetooth.requestDevice()` は**ボタンのクリックなど、ユーザー操作から**呼ぶ。
- Chrome の対応環境:
  - 使える: Windows 10以降、macOS、ChromeOS、Android
  - Linux: フラグ（`#experimental-web-platform-features`）が必要な場合がある
  - iPhone / iPad: 標準では不可（Bluefy などの専用ブラウザなら動くという報告あり）
  - **審査に使うPCで事前に必ず動作確認する。**
- 1回の `requestDevice` で接続できるのは1台。**2台なら2回呼ぶ**（「A接続」「B接続」のボタンを分ける）。
- TypeScript では型定義が要る: `npm i -D @types/web-bluetooth`

### 6.2 UUID（サービスは共通 `10b20100-5b3b-4571-9508-cf3efcd7bbae`）

| 機能 | Characteristic UUID | 主な用途 |
|---|---|---|
| ID情報 | `10b20101-…` | Position ID（マット上の x, y, 角度）を通知で受け取る |
| モーター | `10b20102-…` | 速度指定、時間指定、目標座標移動、複数目標の移動 |
| ランプ | `10b20103-…` | LEDの色 |
| サウンド | `10b20104-…` | 効果音、MIDI |
| センサー | `10b20106-…` | 傾き・衝突・ダブルタップなど |
| ボタン | `10b20107-…` | 上面ボタン |
| バッテリー | `10b20108-…` | 残量 |
| 設定 | `10b201ff-…` | 通知の設定など |

（`…` 部分はすべて `-5b3b-4571-9508-cf3efcd7bbae`。Web Bluetooth では**小文字**で書く）

### 6.3 最小コード（Next.js の Client Component から呼ぶ）

```ts
// lib/toio.ts
const SUFFIX = "-5b3b-4571-9508-cf3efcd7bbae";
const SERVICE = "10b20100" + SUFFIX;
const ID = "10b20101" + SUFFIX, MOTOR = "10b20102" + SUFFIX, LIGHT = "10b20103" + SUFFIX;

export type Pose = { x: number; y: number; angle: number } | null;

export async function connectCube(onPose: (p: Pose) => void, onMoveResult?: (code: number) => void) {
  const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [SERVICE] }] });
  const server = await device.gatt!.connect();
  const svc = await server.getPrimaryService(SERVICE);
  const motor = await svc.getCharacteristic(MOTOR);
  const id = await svc.getCharacteristic(ID);
  const light = await svc.getCharacteristic(LIGHT);

  id.addEventListener("characteristicvaluechanged", (e) => {
    const v = (e.target as BluetoothRemoteGATTCharacteristic).value!;
    const t = v.getUint8(0);
    if (t === 0x01) onPose({ x: v.getUint16(1, true), y: v.getUint16(3, true), angle: v.getUint16(5, true) });
    else if (t === 0x03) onPose(null);               // マットから外れた（Position ID missed）
  });
  await id.startNotifications();

  motor.addEventListener("characteristicvaluechanged", (e) => {
    const v = (e.target as BluetoothRemoteGATTCharacteristic).value!;
    if (v.getUint8(0) === 0x83 || v.getUint8(0) === 0x84) onMoveResult?.(v.getUint8(2)); // 0=成功 1=タイムアウト 2=ID見失い…
  });
  await motor.startNotifications();

  return { device, motor, light };
}

/** 左右モーター（-115〜115。マイナスは後退）を durationMs だけ回す。8未満は停止扱い */
export function motorBytes(left: number, right: number, durationMs = 0) {
  const dir = (v: number) => (v >= 0 ? 1 : 2);
  const spd = (v: number) => Math.min(115, Math.abs(Math.round(v)));
  return new Uint8Array([0x02, 0x01, dir(left), spd(left), 0x02, dir(right), spd(right),
                         Math.min(255, Math.round(durationMs / 10))]);
}

/** マット上の (x, y) へ移動（toio が自分で制御）。angleDeg 省略時は向きを指定しない */
export function moveToBytes(x: number, y: number, opt: { id?: number; timeoutSec?: number; maxSpeed?: number; angleDeg?: number } = {}) {
  const b = new DataView(new ArrayBuffer(13));
  b.setUint8(0, 0x03); b.setUint8(1, opt.id ?? 0); b.setUint8(2, opt.timeoutSec ?? 5);
  b.setUint8(3, 0);                       // 移動タイプ 0: 回転しながら移動
  b.setUint8(4, opt.maxSpeed ?? 80);      // 10〜255
  b.setUint8(5, 0);                       // 速度変化 0: 一定
  b.setUint8(6, 0);
  b.setUint16(7, x, true); b.setUint16(9, y, true);
  const angle = opt.angleDeg === undefined ? (0x5 << 13)                 // 0x5: 角度を指定しない
                                           : (0x0 << 13) | (opt.angleDeg & 0x1fff);
  b.setUint16(11, angle, true);
  return new Uint8Array(b.buffer);
}

/** LED（durationMs=0 で点灯し続ける）。仕様: https://toio.github.io/toio-spec/docs/ble_light */
export function lightBytes(r: number, g: number, b: number, durationMs = 0) {
  return new Uint8Array([0x03, Math.min(255, Math.round(durationMs / 10)), 0x01, 0x01, r, g, b]);
}

// 使い方: await cube.motor.writeValueWithoutResponse(moveToBytes(250, 250));
```

### 6.4 モーター制御の早見表（仕様より）

| コマンド | 先頭バイト | 内容 |
|---|---|---|
| 速度指定 | `0x01` | 次の命令まで回り続ける |
| 時間指定 | `0x02` | 最後のバイト×10ms だけ回る（0は無制限） |
| **目標座標へ移動** | `0x03` | toio自身が制御して (x, y, 角度) へ移動。結果は通知 `0x83` で届く（0=成功, 1=タイムアウト, 2=ID見失い, 3=パラメータ不正…）。到達の判定基準は x, y が15以内かつ角度が4°以内 |
| **複数目標の移動** | `0x04` | 最大29点を連続で移動。経路・図形を描くのに使う |
| 加速度指定 | `0x05` | 並進速度、加速度、回転速度などを指定 |

- 速度の値は **8〜115 の範囲で線形**（8未満は停止、115以上は一定）。
- マット座標の範囲（Position ID）:

| マット | X | Y |
|---|---|---|
| トイオ・コレクション（リング面） | 45–455 | 45–455 |
| トイオ・コレクション（カラータイル面） | 545–955 | 45–455 |
| 簡易プレイマット（コアキューブ単体に付属） | 98–402 | 142–358 |

- 座標の向きは画像と同じく右がX+、下がY+と考えてよいが、**角度の0°方向と回る向きは実機で確認**すること。

### 6.5 マットが無い場合

- Position ID が使えないので、位置はカメラで推定する:
  - toioの上に色シールや**ArUcoマーカー**を貼り、OpenCVで検出する（`cv2.aruco.ArucoDetector`、`opencv-contrib-python` が必要）。
  - または色検出で位置を求める。
- 移動は「時間指定（0x02）で短く動かす → 撮影 → 誤差を見て修正」を繰り返す。VLMは毎回呼ばず、**目標を決めるときだけ**呼ぶ。
- 進む方向を決めるだけなら PIVOT型（3.4c）の矢印選択が使える。

### 6.6 当日のハマりどころ

- **電池:** 決勝前に満充電にする。低電圧で接続が不安定になる。
- **切断への備え:** 「再接続」ボタンを用意し、`gattserverdisconnected` イベントで画面に表示する。
- **マット外れ:** 通知 `0x03` が来たら UI で警告し、動作を止める。
- **電波の混雑:** 会場は Bluetooth が混む。接続が切れてもデモが続けられるよう、手動操作のモードも用意する。

参考実装: [p5.toio](https://github.com/tetunori/p5.toio)（p5.js＋Web Bluetooth）、[Zenn: スマホの傾きでtoioを動かす](https://zenn.dev/kaz399/articles/ce83d57f0e65a1)、[toio.js](https://github.com/toio/toio.js)（Node.js用）、[公式通信仕様](https://toio.github.io/toio-spec/)

---

## 7. Next.js ＋ FastAPI の最小構成

```
app/                      # Next.js (App Router)
  page.tsx                # カメラ表示、toio接続ボタン、判断結果のオーバーレイ
  lib/toio.ts             # §6.3
backend/                  # FastAPI
  main.py                 # /decide
  vlm.py schema.py marks.py
```

**backend/main.py**

```python
import base64, io
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
from marks import draw_marks
from vlm import decide
from schema import sanitize

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class DecideReq(BaseModel):
    image_b64: str                     # JPEG（data: の接頭辞なし）
    instruction: str
    marks: list[tuple[int, int]]       # 画像上の候補点（フロントで計算 or 固定の格子点）
    pose: dict | None = None           # {"x":..,"y":..,"angle":..}
    last: str = ""

@app.post("/decide")
def decide_api(req: DecideReq):
    img = Image.open(io.BytesIO(base64.b64decode(req.image_b64))).convert("RGB")
    marked = draw_marks(img, req.marks)
    buf = io.BytesIO(); marked.save(buf, format="JPEG", quality=80)
    marked_b64 = base64.b64encode(buf.getvalue()).decode()
    prompt = PROMPT_TEMPLATE.format(instruction=req.instruction, last=req.last,
                                    **(req.pose or {"x": "?", "y": "?", "angle": "?"}))
    d = sanitize(decide(marked_b64, prompt), len(req.marks))
    return {"decision": d.model_dump(), "marked_image": marked_b64}   # 印付き画像を返してデモ画面に表示
```

（`PROMPT_TEMPLATE` は §5.2 を `{x} {y} {angle} {instruction} {last}` の差し込み付きで定義する）

**フロントで画像を取る（`page.tsx` の一部）**

```ts
async function captureJpegB64(video: HTMLVideoElement, width = 768) {
  const c = document.createElement("canvas");
  c.width = width; c.height = Math.round(video.videoHeight * width / video.videoWidth);
  c.getContext("2d")!.drawImage(video, 0, 0, c.width, c.height);   // ミラー表示は CSS だけで行い、送る画像は反転しない
  return c.toDataURL("image/jpeg", 0.75).split(",")[1];
}
// const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
```

**デプロイ:**
- フロントは Vercel（HTTPSになるので Web Bluetooth の条件を満たす）。
- バックエンドは Vercel の Python 関数、Cloud Run、Render など。
- 時間がなければ、ローカルの FastAPI を `cloudflared tunnel` などでHTTPS公開する方法もある。
- APIキーはバックエンドの環境変数だけに置く。

---

## 8. 3分デモで見せるコツ

- **画面を3分割する:** ①カメラ映像（印付き）、②VLMの `observation / reasoning`（吹き出し風）、③行動ログ（タイムライン）。実物が動くのと同時に「AIがこう考えた」が見える。
- **審査員に操作してもらう:** 指示を入力する、音声で話す、物を置き換える、など。ルールにも「審査員が実際に作品を使用」とある。
- **15秒で分かる導入:** テーマとの関係を一言で伝える。
- **失敗に備える:**
  - 手動モードのボタン
  - 録画のバックアップ
  - 「判断できない」ときに止まる様子もあえて見せる（安全設計のアピールになる）
- **質疑の想定:** 「なぜVLMを使うのか（ルールベースとの違い）」「遅延をどう扱ったか」に一言で答えられるようにする。

---

## 9. 論文・資料リスト（ハッカソンで使えるところ）

### A. LLM/VLMにロボットの段取りを考えさせる（高レベル計画）

| 論文 | 年 | 一言要約 | ハッカソンで使えるところ |
|---|---|---|---|
| [SayCan: Do As I Can, Not As I Say](https://arxiv.org/abs/2204.01691) | 2022 | LLMは「できること一覧」から選び、実行可能性の評価と掛け合わせる | **行動を選択肢にする（3.1）**の原点 |
| [Inner Monologue](https://arxiv.org/abs/2207.05608) | 2022 | 成功検知や場面記述を言語でLLMに返し、閉ループで計画し直す | **閉ループ（3.5）**、履歴の渡し方 |
| [Code as Policies](https://arxiv.org/abs/2209.07753) | 2022 | LLMがロボットAPIを呼ぶコードを書く | **命令列の生成（3.10）**、図形を描く動き |
| [ProgPrompt](https://arxiv.org/abs/2209.11302) | 2022 | 使える行動と物体をプログラム風のプロンプトで与える | プロンプトの書き方 |
| [ChatGPT for Robotics](https://arxiv.org/abs/2306.17582) | 2023 | LLMでロボットを動かす設計原則（API設計、人によるフィードバック） | 関数APIの設計 |
| [VoxPoser](https://arxiv.org/abs/2307.05973) | 2023 | 言語から「行くべき場所／避ける場所」の3D価値マップを作り、軌道を最適化 | グリッドのコスト表の発想 |
| [ViLa: Look Before You Leap](https://arxiv.org/abs/2311.17842) | 2023 | GPT-4Vで画像を見ながら段取りを立て、閉ループで更新 | VLMによる計画 |

### B. 画像に描き込む／指させる（Visual Prompting・Grounding）

| 論文 | 年 | 一言要約 | ハッカソンで使えるところ |
|---|---|---|---|
| [Set-of-Mark (SoM)](https://arxiv.org/abs/2310.11441) | 2023 | 領域に番号を振るとGPT-4Vの位置特定が大きく改善 | **番号を選ばせる（3.4a）** |
| [SCAFFOLD](https://arxiv.org/abs/2402.12058) | 2024 | 座標付きのドット格子を重ねると視覚と言語の対応がとりやすい | **グリッド重畳（3.4b）** |
| [PIVOT](https://arxiv.org/abs/2402.07872) | 2024 | 候補の矢印を描いて選ばせ、反復して絞り込む | **方向の決定（3.4c）** |
| [MOKA](https://arxiv.org/abs/2403.03174) | 2024 | 候補キーポイントに印を付けてVLMに選ばせ、操作に変換 | 触れる点の選択（3.4d） |
| [RoboPoint](https://arxiv.org/abs/2406.10721) | 2024 | 空間アフォーダンス（置ける場所など）を点で答えるVLM | 「点で答えさせる」設計 |
| [Molmo](https://arxiv.org/abs/2409.17146) | 2024 | 画像上を点で指すことを学習したオープンVLM | pointing の考え方 |
| [SpatialVLM](https://arxiv.org/abs/2401.12168) | 2024 | 空間推論データでVLMの距離・位置関係の理解を強化 | VLMの空間推論の限界を知る |
| [ReKep](https://arxiv.org/abs/2409.01652) | 2024 | キーポイント間の制約をVLMにコードとして書かせて操作 | キーポイント＋コード生成 |

### C. 推論・失敗の検知と検証

| 論文 | 年 | 一言要約 | ハッカソンで使えるところ |
|---|---|---|---|
| [ECoT: Embodied Chain-of-Thought](https://arxiv.org/abs/2407.08693) | 2024 | 行動の前にサブタスクや物体位置を推論させると汎化が向上 | **reasoning → action の順（3.6）** |
| [REFLECT](https://arxiv.org/abs/2306.15724) | 2023 | ロボットの失敗をLLMに説明させ、修正計画を立てる | 失敗時のリトライ文言 |
| [AHA](https://arxiv.org/abs/2410.00371) | 2024 | 操作の失敗を検知・説明するVLM | **判定を別の呼び出しにする（3.5）** |
| [Self-Consistency](https://arxiv.org/abs/2203.11171) | 2022 | 複数サンプルの多数決で精度向上 | **並列3回の多数決（3.8）** |

### D. VLMの弱点を知る

| 論文 | 年 | 分かること |
|---|---|---|
| [Eyes Wide Shut?](https://arxiv.org/abs/2401.06209) | 2024 | 向き・数・位置など、単純な視覚パターンをVLMが取り違える |
| [Vision Language Models Are Blind](https://arxiv.org/abs/2407.06581) | 2024 | 線の交差や円の重なりといった低レベルの視覚判定が苦手 |
| [BLINK](https://arxiv.org/abs/2404.12390) | 2024 | 人間なら一瞬で分かる知覚タスク（奥行き、対応点など）で大きく劣る |
| [Thinking in Space (VSI-Bench)](https://arxiv.org/abs/2412.14171) | 2024 | 空間の記憶や推論がまだ弱く、認知マップを作らせると改善する |

### E. VLMに道具（コード・切り出し）を使わせる

| 論文 | 年 | 一言要約 |
|---|---|---|
| [VisProg](https://arxiv.org/abs/2211.11559) / [ViperGPT](https://arxiv.org/abs/2303.08128) | 2022/2023 | 視覚の質問をLLMがプログラムに分解して解く |
| [V*: Guided Visual Search](https://arxiv.org/abs/2312.14135) | 2023 | 必要な部分を探して拡大する（3.9 の根拠） |
| [Visual Sketchpad](https://arxiv.org/abs/2406.09403) | 2024 | VLMが自分で補助線・切り出し・描き込みをして推論する |

### F. VLA・ロボット基盤モデル（動向の把握用。ハッカソンで直接は使わない）

| 論文・発表 | 年 | 一言要約 |
|---|---|---|
| [RT-2](https://arxiv.org/abs/2307.15818) | 2023 | VLMに行動をトークンとして出力させる VLA の始まり |
| [OpenVLA](https://arxiv.org/abs/2406.09246) | 2024 | オープンな7BのVLA |
| [π0](https://arxiv.org/abs/2410.24164) / [π0.5](https://arxiv.org/abs/2504.16054) | 2024/2025 | flow matching で連続的な行動を生成。π0.5 は開かれた環境への汎化 |
| [Gemini Robotics](https://arxiv.org/abs/2503.20020) | 2025 | Gemini 2.0 ベースの VLA と、空間推論の ER モデル |
| [Gemini Robotics 1.5](https://arxiv.org/abs/2510.03342) | 2025 | ER 1.5 が段取りを決め、VLA が実行する分業。VLA も行動の前に「考える」 |
| [GR00T N1](https://arxiv.org/abs/2503.14734) | 2025 | ヒューマノイド向け。遅いVLM（System 2）と速い行動生成（System 1）の二重構造 |
| 2026年の動き | 2026 | Physical Intelligence が **π0.7**（4月、複数スキルの組み合わせによる汎化をうたう）を発表。Google DeepMind が **Gemini Robotics 2 / ER 2**（7月30日、ER 2 は Gemini API で公開）を発表 |

### G. 公式ドキュメント（当日すぐ引く用）

- Gemini Robotics-ER: https://ai.google.dev/gemini-api/docs/robotics-overview
- Gemini 画像理解（ボックス・セグメンテーション）: https://ai.google.dev/gemini-api/docs/image-understanding
- Gemini モデル一覧: https://ai.google.dev/gemini-api/docs/models
- Claude Vision: https://platform.claude.com/docs/en/build-with-claude/vision
- Claude 構造化出力: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- OpenAI 画像入力: https://developers.openai.com/api/docs/guides/images-vision
- OpenAI モデル一覧: https://developers.openai.com/api/docs/models
- toio 通信仕様: https://toio.github.io/toio-spec/ （モーター: `/docs/ble_motor`、ID: `/docs/ble_id`、マット座標: `/docs/hardware_position_id`）
- Web Bluetooth（Chrome）: https://developer.chrome.com/docs/capabilities/bluetooth
- MediaPipe（ブラウザで手・ポーズ・物体を検出）: https://ai.google.dev/edge/mediapipe/solutions/guide
