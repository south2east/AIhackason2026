import { connection } from "next/server";
import { listKnowhow } from "@/lib/knowhow-store";

export async function GET() {
  // Always read the latest tips at request time (never prerender this list at build).
  await connection();
  try {
    return Response.json({ items: await listKnowhow() });
  } catch (e) {
    console.error("list knowhow failed", e);
    return Response.json({ items: [], error: "ノウハウを読み込めませんでした" });
  }
}
