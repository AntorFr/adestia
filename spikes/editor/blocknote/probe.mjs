/**
 * Custom-block probe — can BlockNote custom blocks carry :::name{attrs} typed
 * blocks with faithful markdown round-trip?
 *
 * 1. Define custom blocks `callout` (inline content, `type` prop) and `app`
 *    (no content, `id`/`project` props) with createBlockSpec.
 * 2. Parse the typed-blocks fixture with that schema -> do directives map to
 *    the custom blocks? (expected: no — md import goes md->HTML->DOM rules)
 * 3. Build callout/app blocks BY HAND in the model -> export to markdown.
 *    What survives? (props? wrapper? nothing?)
 * 4. Same, with a custom toExternalHTML that tries to smuggle the ::: syntax
 *    out as text — the only escape hatch available.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BlockNoteSchema, defaultBlockSpecs, createBlockSpec } from "@blocknote/core";
import { ServerBlockNoteEditor } from "@blocknote/server-util";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = await readFile(path.resolve(here, "..", "fixtures", "typed-blocks.md"), "utf8");

function makeSchema({ smuggle }) {
  const callout = createBlockSpec(
    {
      type: "callout",
      propSchema: { type: { default: "note", values: ["note", "warning"] } },
      content: "inline",
    },
    {
      render() {
        const dom = document.createElement("div");
        dom.setAttribute("data-callout-type", "placeholder");
        const contentDOM = document.createElement("div");
        dom.appendChild(contentDOM);
        return { dom, contentDOM };
      },
      ...(smuggle && {
        toExternalHTML(block) {
          // Escape hatch attempt: emit the directive syntax as literal text.
          const dom = document.createElement("p");
          dom.textContent = `:::callout{type="${block.props.type}"} ... :::`;
          return { dom };
        },
      }),
      parse(el) {
        if (el.tagName === "DIV" && el.hasAttribute("data-callout-type")) {
          return { type: el.getAttribute("data-callout-type") };
        }
        return undefined;
      },
    },
  );
  const app = createBlockSpec(
    {
      type: "app",
      propSchema: { id: { default: "" }, project: { default: "" } },
      content: "none",
    },
    {
      render() {
        const dom = document.createElement("div");
        dom.setAttribute("data-app", "true");
        return { dom };
      },
    },
  );
  return BlockNoteSchema.create({
    blockSpecs: { ...defaultBlockSpecs, callout: callout(), app: app() },
  });
}

// ---- 1+2: parse fixture with custom schema -------------------------------
const editor = ServerBlockNoteEditor.create({ schema: makeSchema({ smuggle: false }) });
const blocks = await editor.tryParseMarkdownToBlocks(fixture);
const count = (t) => blocks.filter((b) => b.type === t).length;
console.log("== probe 1: markdown import with custom schema ==");
console.log(`blocks parsed: ${blocks.length}`);
console.log(`  type=callout : ${count("callout")}   (fixture contains 2 ::: callout directives)`);
console.log(`  type=app     : ${count("app")}   (fixture contains 1 ::: app directive)`);
console.log(`  type=paragraph containing ':::' : ${blocks.filter((b) => JSON.stringify(b.content ?? "").includes(":::")).length}`);

// ---- 3: hand-built custom blocks -> markdown ------------------------------
console.log("\n== probe 2: hand-built callout/app blocks -> markdown export ==");
const handBuilt = [
  { type: "callout", props: { type: "warning" }, content: [{ type: "text", text: "Watch out", styles: {} }] },
  { type: "app", props: { id: "workbench", project: "rangement-garage" } },
  { type: "paragraph", content: [{ type: "text", text: "After.", styles: {} }] },
];
const md1 = await editor.blocksToMarkdownLossy(handBuilt);
console.log(JSON.stringify(md1));
const html1 = await editor.blocksToHTMLLossy(handBuilt);
console.log("external HTML:", JSON.stringify(html1));

// ---- 4: same with toExternalHTML smuggling --------------------------------
console.log("\n== probe 3: custom toExternalHTML smuggling ::: syntax ==");
const editor2 = ServerBlockNoteEditor.create({ schema: makeSchema({ smuggle: true }) });
const md2 = await editor2.blocksToMarkdownLossy(handBuilt);
console.log(JSON.stringify(md2));
