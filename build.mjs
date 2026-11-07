// Renders README.md, docs/*.md and notes/*.md into static HTML under public/.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, dirname, relative, posix } from "node:path";
import { marked } from "marked";

const OUT = "public";
const SECTIONS = [
  { dir: ".", label: "トップ", files: ["README.md"] },
  { dir: "docs", label: "docs — 決勝向け調査資料" },
  { dir: "notes", label: "notes — 基礎メモ" },
];

const outPath = (src) => src.replace(/README\.md$/, "index.html").replace(/\.md$/, ".html");

// Collect pages
const pages = [];
for (const s of SECTIONS) {
  const files = s.files ?? readdirSync(s.dir).filter((f) => f.endsWith(".md")).sort((a, b) =>
    a === "README.md" ? -1 : b === "README.md" ? 1 : a.localeCompare(b));
  for (const f of files) {
    const src = posix.join(s.dir, f);
    const md = readFileSync(src, "utf8");
    const title = (md.match(/^#\s+(.+)$/m)?.[1] ?? f).trim();
    pages.push({ src, out: outPath(src), title, section: s.label, md });
  }
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function rel(from, to) {
  const r = relative(dirname(from), to).split("\\").join("/");
  return r === "" ? "./" : r;
}

function nav(current) {
  let html = "";
  let lastSection = null;
  for (const p of pages) {
    if (p.section !== lastSection) {
      if (lastSection !== null) html += "</ul>";
      html += `<p class="nav-h">${esc(p.section)}</p><ul>`;
      lastSection = p.section;
    }
    const short = p.title.split(/\s+—\s+/)[0];
    html += `<li><a href="${rel(current.out, p.out)}"${p === current ? ' aria-current="page"' : ""}>${esc(short)}</a></li>`;
  }
  return html + "</ul>";
}

const CSS = `
:root{--bg:#fbfaf7;--fg:#1f2328;--muted:#656d76;--line:#e3e1db;--accent:#0b6bcb;--code:#f1efe9;--side:#f4f2ed}
@media (prefers-color-scheme:dark){:root{--bg:#16181c;--fg:#e6e6e6;--muted:#9aa0a6;--line:#2c3036;--accent:#6cb1ff;--code:#22262c;--side:#1c1f24}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.75 system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif}
.wrap{display:grid;grid-template-columns:260px minmax(0,1fr);min-height:100vh}
aside{background:var(--side);border-right:1px solid var(--line);padding:24px 18px;position:sticky;top:0;height:100vh;overflow:auto}
aside .brand{font-weight:700;font-size:18px;color:var(--fg);text-decoration:none;display:block;margin-bottom:12px}
.nav-h{font-size:12px;color:var(--muted);margin:18px 0 4px;font-weight:600;letter-spacing:.02em}
aside ul{list-style:none;margin:0;padding:0}
aside li a{display:block;padding:4px 8px;border-radius:6px;color:var(--fg);text-decoration:none;font-size:14px;line-height:1.5}
aside li a:hover{background:var(--line)}
aside li a[aria-current]{background:var(--accent);color:#fff}
main{padding:40px 48px 80px;max-width:900px;width:100%}
h1{font-size:1.9em;line-height:1.3;margin:0 0 .6em}
h2{font-size:1.4em;margin:2em 0 .6em;padding-bottom:.3em;border-bottom:1px solid var(--line)}
h3{font-size:1.15em;margin:1.6em 0 .5em}
a{color:var(--accent)}
code{background:var(--code);padding:.15em .35em;border-radius:4px;font:.88em/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
pre{background:var(--code);padding:14px 16px;border-radius:8px;overflow:auto}
pre code{background:none;padding:0}
blockquote{margin:1em 0;padding:.2em 1em;border-left:4px solid var(--line);color:var(--muted)}
table{border-collapse:collapse;display:block;overflow:auto;margin:1em 0}
th,td{border:1px solid var(--line);padding:6px 12px;text-align:left;vertical-align:top}
th{background:var(--side)}
hr{border:0;border-top:1px solid var(--line);margin:2em 0}
img{max-width:100%}
@media (max-width:800px){
  .wrap{display:block}
  aside{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line);padding:16px}
  main{padding:24px 16px 60px}
}`;

// Rewrite relative .md links to .html
marked.use({
  gfm: true,
  walkTokens(token) {
    if (token.type === "link" && !/^[a-z]+:/i.test(token.href) && !token.href.startsWith("#")) {
      token.href = token.href.replace(/(^|\/)README\.md(#|$)/, "$1index.html$2").replace(/\.md(#|$)/, ".html$1");
    }
  },
});

rmSync(OUT, { recursive: true, force: true });
for (const p of pages) {
  const body = marked.parse(p.md);
  const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.title)} | AIhackason2026</title><style>${CSS}</style></head>
<body><div class="wrap"><aside><a class="brand" href="${rel(p.out, "index.html")}">AIhackason2026</a>${nav(p)}</aside>
<main>${body}</main></div></body></html>`;
  const dest = join(OUT, p.out);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, html);
  console.log(`${p.src} -> ${dest}`);
}
