import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { defineTool, ToolRegistry } from "@agent-desk/harness";

const here = dirname(fileURLToPath(import.meta.url));
// Overridable so tests can point at an isolated temp dir instead of mutating
// the committed example notes.
export const DATA_DIR = process.env["MCP_NOTES_DATA_DIR"] ?? join(here, "..", "data");

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

// basename() strips any directory components from a model-supplied title,
// so a title like "../../etc/passwd" can't escape DATA_DIR.
function notePath(title: string): string {
  return join(DATA_DIR, `${basename(title)}.md`);
}

async function listNoteFiles(): Promise<string[]> {
  await ensureDataDir();
  const entries = await readdir(DATA_DIR);
  return entries.filter((entry) => entry.endsWith(".md"));
}

export const registry = new ToolRegistry();

registry.register(
  defineTool({
    name: "notes.list",
    description: "Lists all note titles.",
    inputSchema: z.object({}),
    handler: async () => {
      const files = await listNoteFiles();
      return files.map((file) => file.replace(/\.md$/, ""));
    },
  }),
);

registry.register(
  defineTool({
    name: "notes.search",
    description: "Searches note titles and bodies for a query substring.",
    inputSchema: z.object({ query: z.string() }),
    handler: async ({ query }) => {
      const files = await listNoteFiles();
      const matches: Array<{ title: string; body: string }> = [];
      for (const file of files) {
        const title = file.replace(/\.md$/, "");
        const body = await readFile(join(DATA_DIR, file), "utf8");
        if (title.includes(query) || body.includes(query)) {
          matches.push({ title, body });
        }
      }
      return matches;
    },
  }),
);

registry.register(
  defineTool({
    name: "notes.write",
    description: "Writes a note under the given title, overwriting any existing note with that title.",
    inputSchema: z.object({ title: z.string(), body: z.string() }),
    handler: async ({ title, body }) => {
      await ensureDataDir();
      await writeFile(notePath(title), body, "utf8");
      return { saved: title };
    },
  }),
);
