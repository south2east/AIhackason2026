import { list, put } from "@vercel/blob";
import type { Knowhow } from "@/lib/game";

// Shared know-how store: one public JSON blob per tip under tips/.
const PREFIX = "tips/";

export async function saveKnowhow(k: Knowhow) {
  await put(`${PREFIX}${k.createdAt}-${k.id}.json`, JSON.stringify(k), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
  });
}

export async function listKnowhow(): Promise<Knowhow[]> {
  const blobs: { url: string }[] = [];
  let cursor: string | undefined;
  do {
    const r = await list({ prefix: PREFIX, cursor, limit: 1000 });
    blobs.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  const items = await Promise.all(
    blobs.map((b) =>
      fetch(b.url, { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<Knowhow>) : null))
        .catch(() => null),
    ),
  );
  return items.filter((k): k is Knowhow => !!k).sort((a, b) => b.createdAt - a.createdAt);
}
