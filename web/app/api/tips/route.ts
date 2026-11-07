import { listTips } from "@/lib/tips";

export async function GET() {
  try {
    return Response.json({ tips: await listTips() });
  } catch (e) {
    console.error("list tips failed", e);
    return Response.json({ tips: [], error: "Tipsを読み込めませんでした" });
  }
}
