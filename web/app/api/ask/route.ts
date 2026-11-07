import { generateText } from "ai";
import { PROMPT_MAX_CHARS, WEAK_MAX_TOKENS, WEAK_MODEL } from "@/lib/game";

export const maxDuration = 30;

// The weak AI: single-turn, no memory, short output.
export async function POST(req: Request) {
  const { prompt } = (await req.json()) as { prompt?: string };
  const text = String(prompt ?? "").slice(0, PROMPT_MAX_CHARS).trim();
  if (!text) return Response.json({ error: "プロンプトが空です" }, { status: 400 });

  if (process.env.DEMO_MODE === "1") return Response.json(demo(text));

  try {
    const r = await generateText({
      model: WEAK_MODEL,
      system: "あなたは小さなAIアシスタントです。日本語で答えてください。",
      prompt: text,
      maxOutputTokens: WEAK_MAX_TOKENS,
    });
    return Response.json({ text: r.text, truncated: r.finishReason === "length" });
  } catch (e) {
    console.error("ask failed", e);
    return Response.json(demo(text));
  }
}

function demo(prompt: string) {
  return {
    text: `（デモ応答）「${prompt.slice(0, 40)}…」について考えました。\n1. 案A\n2. 案B\n3. 案C`,
    truncated: false,
    demo: true,
  };
}
