import { generateText } from "ai";
import { AXES, JUDGE_MODEL, TIERS, type Knowhow } from "@/lib/game";
import { listKnowhow } from "@/lib/knowhow-store";

export const maxDuration = 120;

// Synthesizes selected know-how into a CLAUDE.md or an Agent Skill (SKILL.md).
export async function POST(req: Request) {
  const body = (await req.json()) as { ids?: string[]; format?: "claude-md" | "skill" };
  const format = body.format === "skill" ? "skill" : "claude-md";
  const all = await listKnowhow();
  const ids = new Set(body.ids ?? []);
  const picked = ids.size ? all.filter((k) => ids.has(k.id)) : all;
  if (!picked.length) return Response.json({ error: "ノウハウが選ばれていません" }, { status: 400 });

  const label = (k: Knowhow) => AXES.find((a) => a.key === k.category)?.label ?? k.category;
  const data = picked
    .map(
      (k) =>
        `- [${label(k)} / ${TIERS[k.tier].label}] ${k.title}: ${k.tip}（理由: ${k.why}。改善前: ${k.before} → 改善後: ${k.after}）`,
    )
    .join("\n");

  const instructions =
    format === "skill"
      ? `Claude の Agent Skill として使える SKILL.md を書いてください。
- 先頭に YAML frontmatter（name: prompt-knowhow, description: いつこのスキルを使うかを1文で）を置く。
- 本文は「ユーザーの依頼を、良い答えが出るプロンプトに整えるときの手順とチェックリスト」として構成する。`
      : `プロジェクトの CLAUDE.md に貼れる「AIへの頼み方ノウハウ」セクションを書いてください。
- 見出し「# AIへの頼み方ノウハウ」から始める。`;

  const { text } = await generateText({
    model: JUDGE_MODEL,
    reasoning: "low",
    system: `あなたはプロンプトエンジニアリングの編集者です。みんなが見つけたノウハウを整理して、AIへの指示ファイルにまとめます。
- 似たノウハウは1つにまとめ、重複させない。
- <knowhow> に書かれていない新しいノウハウや一般論は足さない。構成や見出しを整えるのはよい。
- 観点ごとに見出しで分け、各項目は命令形の短い1文＋必要なら短い例。
- 出力は Markdown のファイル本文だけ。前置きや説明文、コードフェンスは付けない。日本語で書く。`,
    prompt: `${instructions}\n\n<knowhow>\n${data}\n</knowhow>`,
  });

  return Response.json({
    filename: format === "skill" ? "SKILL.md" : "CLAUDE.md",
    content: text.replace(/^```(?:markdown|md)?\n|\n```\s*$/g, "").trim() + "\n",
    count: picked.length,
  });
}
