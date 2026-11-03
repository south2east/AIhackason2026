# MCP（Model Context Protocol）— AIアプリと外部ツールをつなぐプロトコル

> 関連: `../docs/ai_agent.md`（エージェントとツールの設計）

---

## 1. 概要

- AIアプリ（Claude、ChatGPT など）と、外部のツールやデータをつなぐためのプロトコル。
- 提供側は、MCPサーバーを一度作れば、MCP対応のどのAIアプリからでも使ってもらえる。
- AIアプリ側は、MCPクライアントを実装すれば、多様なデータソースに接続できる。

---

## 2. 構成と処理の流れ

| 役割 | 担当 |
|---|---|
| ホスト | Claude などのAIアプリ |
| クライアント | ホストの中で、各サーバーとの通信を担う |
| サーバー | ツールやデータを提供する |

1. ユーザーがアプリに質問する。
2. アプリが、質問と「使えるツールの一覧」をLLMに送る。
3. LLMが、どのツールを使うかを選ぶ。
4. クライアントが該当サーバーに引数を送り、結果を受け取る。
5. 結果をLLMに渡し、LLMが自然言語にして返す。

---

## 3. サーバーが提供する3つの部品

| 部品 | 役割 | イメージ |
|---|---|---|
| **Tools** | AIが実行する操作 | POST（何かをする） |
| **Resources** | AIに読ませるデータ | GET（情報を取る） |
| **Prompts** | 定型の指示テンプレート | 使い回せる指示文 |

使い分けの目安: 操作なら Tools、データや文書の取得なら Resources、定型の指示なら Prompts。

ファイル操作、DB問い合わせ、API呼び出し、ハードウェア制御などをAIから直接扱える。[ROS MCP Server](https://github.com/robotmcp/ros-mcp-server)（ROS: ロボット開発の標準的なミドルウェア）のように、ロボットをAIから動かす例もある。

---

## 4. 使い方

### (A) 既存のMCPサーバーを使う（一番手軽）

- Claude Desktop、Claude Code、Cursor などの設定ファイルに、使いたいサーバーを登録するだけ。
- GitHub、Slack、Google Drive、ブラウザ操作など、公開済みのサーバーが大量にある。

### (B) 自分でMCPサーバーを作る

Python なら **FastMCP** を使うと、関数にデコレータを付けるだけでツールになる。

```python
from fastmcp import FastMCP

mcp = FastMCP("Demo")

@mcp.tool
def add(a: int, b: int) -> int:
    """Add two numbers"""  # この説明文をLLMが読んでツールを選ぶ
    return a + b

if __name__ == "__main__":
    mcp.run()
```

- 起動は `fastmcp run server.py`。
- AIアプリに組み込む前に、`fastmcp list` でツール一覧を、`fastmcp call` で単体実行を確認できる（`list` と `call` は FastMCP 3.0 以降）。

```bash
fastmcp list server.py
fastmcp call server.py add a=1 b=2
```

**良いツールを作るコツ:**

- 説明文をユーザー向けに書く。
- 引数に型を付ける。
- 最初は読み取り専用にする。
- 名前は `run` や `do_thing` ではなく、`search_tickets` のように具体的にする。

### 通信方式は2種類

| 方式 | 接続の形 | 用途 |
|---|---|---|
| **stdio** | 同じPC上で、AIアプリがサーバーを直接起動する | ローカル用 |
| **Streamable HTTP** | ネットワーク越しに接続する | リモート・共有用 |

---

## 5. 最新動向（2026-07-28 版の仕様）

- 2026年7月28日に最新仕様が正式リリースされた。
- 最大の変更は**ステートレス化**。初期化のハンドシェイクとセッションが廃止され、各リクエストが自分のプロトコルバージョンと機能情報を持つ。
- そのため、2026年7月以前のチュートリアルは古い仕様の場合がある。調べるときは、どの版の話かを確認する。

---

## 6. ハッカソンでの使いどころ

- 「音声解析」「画像認識」「デバイス操作」などをそれぞれMCPツールにしておけば、AIがユーザーの指示に応じて自分で組み合わせてくれる。
- お題がフィジカルAIなら、モーターやセンサーの操作関数をツールにするだけで「AIが判断して動くロボット」の骨格になる。
- 一度作ったツールは、次の大会や研究でも使い回せる。

---

## 付録. 公式ドキュメント

- MCP: https://modelcontextprotocol.io
- 仕様 2026-07-28 版のリリース: https://github.com/modelcontextprotocol/specification/releases/tag/2026-07-28
- FastMCP CLI: https://gofastmcp.com/cli/overview
- FastMCP のクライアント用コマンド（`list` / `call`）: https://gofastmcp.com/cli/client
