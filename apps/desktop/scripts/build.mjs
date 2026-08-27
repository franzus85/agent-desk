import { build } from "esbuild";
import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ESM, not CJS: esbuild empties out import.meta.url when targeting cjs
// (it doesn't shim it), and the rest of this monorepo uses
// fileURLToPath(import.meta.url) for script-relative paths — Electron's
// main process has supported ESM entry points for several major versions.
await build({
  entryPoints: [join(root, "src/main/index.ts")],
  outfile: join(root, "dist/main/index.mjs"),
  platform: "node",
  format: "esm",
  bundle: true,
  external: ["electron"],
  sourcemap: true,
});

// CJS, unlike main: a sandboxed preload script's loader rejects ESM
// outright ("Cannot use import statement outside a module") — confirmed
// empirically, not a documented restriction I could find up front.
await build({
  entryPoints: [join(root, "src/preload/index.ts")],
  outfile: join(root, "dist/preload/index.cjs"),
  platform: "node",
  format: "cjs",
  bundle: true,
  external: ["electron"],
  sourcemap: true,
});

// Utility process — a plain Node process Electron manages (utilityProcess
// .fork), not a renderer. Same ESM reasoning as main.
await build({
  entryPoints: [join(root, "src/utility/harness-process.ts")],
  outfile: join(root, "dist/utility/harness-process.mjs"),
  platform: "node",
  format: "esm",
  bundle: true,
  external: ["electron"],
  sourcemap: true,
});

// Renderer is a plain <script> tag in a Chromium page — bundle to a single
// browser-target IIFE, no module system needed.
await build({
  entryPoints: [join(root, "src/renderer/index.ts")],
  outfile: join(root, "dist/renderer/index.js"),
  platform: "browser",
  format: "iife",
  bundle: true,
  sourcemap: true,
});

await mkdir(join(root, "dist/renderer"), { recursive: true });
await cp(join(root, "src/renderer/index.html"), join(root, "dist/renderer/index.html"));
