import { generateText, type ModelMessage } from "ai";
import { PROMPT_MAX_CHARS, TIERS, type Tier } from "@/lib/game";

export const maxDuration = 60;

type Turn = { prompt: string; response: string };

// Beginner: single-turn, no memory, short output. Advanced: stronger model with conversation history.
export async function POST(req: Request) {
  const body = (await req.json()) as { prompt?: string; tier?: Tier; history?: Turn[] };
  const tier = TIERS[body.tier === "advanced" ? "advanced" : "beginner"];
  const text = String(body.prompt ?? "").slice(0, PROMPT_MAX_CHARS).trim();
  if (!text) return Response.json({ error: "プロンプトが空です" }, { status: 400 });

  if (process.env.DEMO_MODE === "1") return Response.json(demo(text));

  const history = tier.memory ? (body.history ?? []).slice(-10) : [];
  const messages: ModelMessage[] = [
    ...history.flatMap((t): ModelMessage[] => [
      { role: "user", content: String(t.prompt).slice(0, PROMPT_MAX_CHARS) },
      { role: "assistant", content: String(t.response).slice(0, 4000) },
    ]),
    { role: "user", content: text },
  ];

  try {
    const r = await generateText({
      model: tier.model,
      system: "あなたはAIアシスタントです。日本語で答えてください。",
      messages,
      maxOutputTokens: tier.maxTokens,
      ...(tier.model.startsWith("anthropic/") ? { reasoning: "low" as const } : {}),
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
