import { list, put } from "@vercel/blob";
import type { Knowhow } from "@/lib/game";

// Shared know-how store on Vercel Blob. Tips are immutable JSON under tips/;
// each rediscovery adds an empty marker under hits/<id>/ so counts never need an
// overwrite (overwritten public blobs can be served stale from the CDN).
const TIPS = "tips/";
const HITS = "hits/";

async function listAll(prefix: string) {
  const blobs: { url: string; pathname: string }[] = [];
  let cursor: string | undefined;
  do {
    const r = await list({ prefix, cursor, limit: 1000 });
    blobs.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return blobs;
}

export async function saveKnowhow(k: Knowhow) {
  await put(`${TIPS}${k.createdAt}-${k.id}.json`, JSON.stringify(k), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
  });
}

export async function addHit(id: string) {
  await put(`${HITS}${id}/${Date.now()}.txt`, "1", { access: "public", contentType: "text/plain", addRandomSuffix: true });
}

export async function listKnowhow(): Promise<Knowhow[]> {
  const [tips, hits] = await Promise.all([listAll(TIPS), listAll(HITS)]);
  const counts = new Map<string, number>();
  for (const h of hits) {
    const id = h.pathname.slice(HITS.length).split("/")[0];
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const items = await Promise.all(
    tips.map((b) =>
      fetch(b.url, { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<Knowhow>) : null))
        .catch(() => null),
    ),
  );
  return items
    .filter((k): k is Knowhow => !!k)
    .map((k) => ({ ...k, count: 1 + (counts.get(k.id) ?? 0) }))
    .sort((a, b) => b.createdAt - a.createdAt);
}
