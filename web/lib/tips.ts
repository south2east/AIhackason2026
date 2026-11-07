import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Tip } from "@/lib/game";

// Curated tips live in web/tips/*.md. next.config.ts traces this folder into the server bundle.
const DIR = path.join(process.cwd(), "tips");

function parse(id: string, raw: string): Tip | null {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return null;
  const meta = Object.fromEntries(
    m[1]
      .split("\n")
      .map((l) => l.match(/^(\w+):\s*(.*)$/))
      .filter((x): x is RegExpMatchArray => !!x)
      .map((x) => [x[1], x[2].trim()]),
  );
  if (!meta.title) return null;
  return {
    id,
    title: meta.title,
    kind: meta.kind === "公式" ? "公式" : "実践",
    source: meta.source ?? "",
    when: meta.when ?? "",
    body: m[2].trim(),
  };
}

export async function listTips(): Promise<Tip[]> {
  const files = (await readdir(DIR)).filter((f) => f.endsWith(".md") && f !== "README.md").sort();
  const tips = await Promise.all(files.map(async (f) => parse(f.slice(0, -3), await readFile(path.join(DIR, f), "utf8"))));
  return tips.filter((t): t is Tip => !!t);
}
