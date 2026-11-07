import { listKnowhow } from "@/lib/knowhow-store";

export async function GET() {
  try {
    return Response.json({ items: await listKnowhow() });
  } catch (e) {
    console.error("list knowhow failed", e);
    return Response.json({ items: [], error: "ノウハウを読み込めませんでした" });
  }
}
