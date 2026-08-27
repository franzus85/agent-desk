import { describe, expect, it } from "vitest";
import { parseMarkdownBlocks } from "./markdown.js";

describe("parseMarkdownBlocks", () => {
  it("parses a plain paragraph", () => {
    expect(parseMarkdownBlocks("hello\nworld")).toEqual([{ type: "paragraph", text: "hello\nworld" }]);
  });

  it("parses a closed fenced code block with a language", () => {
    expect(parseMarkdownBlocks("before\n```ts\nconst x = 1;\n```\nafter")).toEqual([
      { type: "paragraph", text: "before" },
      { type: "code", lang: "ts", code: "const x = 1;", closed: true },
      { type: "paragraph", text: "after" },
    ]);
  });

  it("treats an unterminated trailing fence as an open, not-yet-closed code block — not a parse error", () => {
    const blocks = parseMarkdownBlocks("Here's the plan:\n```ts\nfunction run(");
    expect(blocks).toEqual([
      { type: "paragraph", text: "Here's the plan:" },
      { type: "code", lang: "ts", code: "function run(", closed: false },
    ]);
  });

  it("stays open across successive token-by-token chunks until the fence actually closes", () => {
    const chunks = ["```py\n", "def f(", "):\n", "    pass\n", "```"];
    let acc = "";
    let lastBlocks = parseMarkdownBlocks(acc);
    for (const chunk of chunks) {
      acc += chunk;
      lastBlocks = parseMarkdownBlocks(acc);
    }
    expect(lastBlocks).toEqual([{ type: "code", lang: "py", code: "def f():\n    pass", closed: true }]);
  });

  it("defaults lang to undefined for a bare fence", () => {
    const blocks = parseMarkdownBlocks("```\nplain\n```");
    expect(blocks).toEqual([{ type: "code", lang: undefined, code: "plain", closed: true }]);
  });
});
