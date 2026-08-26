import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateSyntheticSkills } from "./generate.js";
import { writeSyntheticSkills } from "./write.js";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "..", "synthetic-skills");

const specs = generateSyntheticSkills();
await writeSyntheticSkills(outDir, specs);
process.stderr.write(`[skills] wrote ${specs.length} synthetic skills to ${outDir}\n`);
