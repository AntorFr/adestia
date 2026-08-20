/**
 * Spike 1 harness — BlockNote candidate.
 *
 * Contract (spikes/editor/README.md):
 *  for every file in ../fixtures/:
 *   1. parse markdown -> BlockNote document model (Block[])
 *   2. serialize back to markdown
 *   3. write result to out/<fixture>.md (raw serializer output, un-normalized)
 *   4. diff against the input; exit non-zero on any difference beyond the
 *      normalizations DECLARED in REPORT.md.
 *
 * DECLARED frontmatter mechanism (M1, see REPORT.md):
 *   BlockNote has no document-metadata or frontmatter concept. YAML
 *   frontmatter is extracted VERBATIM before the editor sees the file and
 *   reinjected VERBATIM after serialization. It never enters the editor
 *   model. The extracted span includes the blank separator line(s)
 *   after the closing fence. (Without M1, BlockNote destroys the
 *   frontmatter — see REPORT.md.)
 *
 * DECLARED normalizations (kept in sync with REPORT.md):
 *   N1  exactly one trailing newline at EOF
 *   N2  unordered-list bullet marker: `-`, `*`, `+` are equivalent
 *       (canonicalized to `-`; text-level regex, adequate for these fixtures)
 *
 * Everything else that differs is counted as a fidelity failure.
 */
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ServerBlockNoteEditor } from "@blocknote/server-util";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(here, "..", "fixtures");
const outDir = path.join(here, "out");

// ---- M1: frontmatter extract/reinject (outside the editor) ---------------
const FM_RE = /^---\n[\s\S]*?\n---\n(?:[ \t]*\n)*/;
function splitFrontmatter(md) {
  const m = md.match(FM_RE);
  return m ? { fm: m[0], body: md.slice(m[0].length) } : { fm: "", body: md };
}

// ---- declared normalizations -------------------------------------------
function normalize(md) {
  let s = md;
  // N2: canonicalize unordered-list bullet markers to `-` (keep indentation)
  s = s
    .split("\n")
    .map((line) => line.replace(/^(\s*)[*+-](\s+)/, "$1-$2"))
    .join("\n");
  // N1: exactly one trailing newline
  s = s.replace(/\n*$/, "\n");
  return s;
}

// ---- minimal LCS line diff (unified-ish, pure JS) ------------------------
function lineDiff(aText, bText) {
  const a = aText.split("\n");
  const b = bText.split("\n");
  const n = a.length, m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const ops = []; // {tag: ' '|'-'|'+', line}
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ tag: " ", line: a[i] }); i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { ops.push({ tag: "-", line: a[i] }); i++; }
    else { ops.push({ tag: "+", line: b[j] }); j++; }
  }
  while (i < n) ops.push({ tag: "-", line: a[i++] });
  while (j < m) ops.push({ tag: "+", line: b[j++] });
  return ops;
}

function renderDiff(ops, context = 2) {
  const keep = new Set();
  ops.forEach((op, idx) => {
    if (op.tag !== " ") for (let k = Math.max(0, idx - context); k <= Math.min(ops.length - 1, idx + context); k++) keep.add(k);
  });
  const lines = [];
  let lastShown = -2;
  ops.forEach((op, idx) => {
    if (!keep.has(idx)) return;
    if (idx > lastShown + 1) lines.push("@@");
    lines.push(op.tag + op.line);
    lastShown = idx;
  });
  return lines.join("\n");
}

// ---- harness -------------------------------------------------------------
await mkdir(outDir, { recursive: true });
const fixtures = (await readdir(fixturesDir)).filter((f) => f.endsWith(".md")).sort();
if (fixtures.length === 0) { console.error("no fixtures found in " + fixturesDir); process.exit(2); }

const editor = ServerBlockNoteEditor.create();
let failures = 0;

for (const fixture of fixtures) {
  const input = await readFile(path.join(fixturesDir, fixture), "utf8");

  // M1: frontmatter never enters the editor model
  const { fm, body } = splitFrontmatter(input);

  // 1. markdown -> editor document model
  const blocks = await editor.tryParseMarkdownToBlocks(body);
  await writeFile(path.join(outDir, fixture.replace(/\.md$/, ".blocks.json")), JSON.stringify(blocks, null, 2));

  // 2. document model -> markdown  (BlockNote's own name for it: *Lossy*)
  const output = fm + (await editor.blocksToMarkdownLossy(blocks));

  // 3. raw serializer output
  await writeFile(path.join(outDir, fixture), output);

  // 4. diff normalized forms
  const na = normalize(input);
  const nb = normalize(output);
  const ops = lineDiff(na, nb);
  const removed = ops.filter((o) => o.tag === "-").length;
  const added = ops.filter((o) => o.tag === "+").length;
  const inputLines = na.trimEnd().split("\n").length;
  const ok = removed === 0 && added === 0;
  if (!ok) failures++;

  const diffText = ok ? "" : renderDiff(ops);
  await writeFile(path.join(outDir, fixture.replace(/\.md$/, ".diff")), diffText + (diffText ? "\n" : ""));

  console.log(`${ok ? "PASS" : "FAIL"}  ${fixture}  (${inputLines} input lines; -${removed} +${added} lines beyond declared normalizations)`);
  if (!ok) {
    console.log(diffText.split("\n").map((l) => "      " + l).join("\n"));
  }
}

console.log(`\n${fixtures.length - failures}/${fixtures.length} fixtures round-trip cleanly.`);
process.exit(failures > 0 ? 1 : 0);
