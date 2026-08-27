export type MarkdownBlock =
  | { type: "paragraph"; text: string }
  | { type: "code"; lang: string | undefined; code: string; closed: boolean };

// Tolerant incremental parsing: the hard case named in the PRD is an
// unterminated code fence arriving token by token. A block whose closing
// ``` hasn't shown up yet is not an error — it's rendered as an
// in-progress code block (closed:false), so the caller can defer syntax
// highlighting until it flips true, rather than the parser choking on it.
export function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  const lines = text.split("\n");
  const blocks: MarkdownBlock[] = [];
  let paragraphLines: string[] = [];
  let i = 0;

  function flushParagraph(): void {
    if (paragraphLines.length > 0) {
      blocks.push({ type: "paragraph", text: paragraphLines.join("\n") });
      paragraphLines = [];
    }
  }

  while (i < lines.length) {
    const line = lines[i]!;
    const fenceMatch = /^```(\w*)\s*$/.exec(line);
    if (fenceMatch) {
      flushParagraph();
      const lang = fenceMatch[1] || undefined;
      const codeLines: string[] = [];
      i += 1;
      let closed = false;
      while (i < lines.length) {
        if (/^```\s*$/.test(lines[i]!)) {
          closed = true;
          i += 1;
          break;
        }
        codeLines.push(lines[i]!);
        i += 1;
      }
      blocks.push({ type: "code", lang, code: codeLines.join("\n"), closed });
      continue;
    }
    paragraphLines.push(line);
    i += 1;
  }
  flushParagraph();
  return blocks;
}
