import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { seedFixture } from "./fixtures.js";

const here = dirname(fileURLToPath(import.meta.url));
const realFixturesDir = join(here, "..", "..", "..", "evals", "fixtures");

describe("seedFixture", () => {
  it("copies the fixture's notes into a private temp dir", async () => {
    const seeded = await seedFixture(realFixturesDir, "seed-week-34");
    try {
      const files = await readdir(seeded.notesDir);
      expect(files.sort()).toEqual(["q3-plan.md"]);
      const body = await readFile(join(seeded.notesDir, "q3-plan.md"), "utf8");
      expect(body).toContain("Project Atlas");
    } finally {
      await seeded.cleanup();
    }
  });

  it("points calendarFile at the fixture's calendar.json without copying it", async () => {
    const seeded = await seedFixture(realFixturesDir, "seed-week-34");
    try {
      expect(seeded.calendarFile).toBe(join(realFixturesDir, "seed-week-34", "calendar.json"));
    } finally {
      await seeded.cleanup();
    }
  });

  it("gives two seedings of the same fixture independent notes dirs", async () => {
    const first = await seedFixture(realFixturesDir, "seed-week-34");
    const second = await seedFixture(realFixturesDir, "seed-week-34");
    try {
      expect(first.notesDir).not.toBe(second.notesDir);
    } finally {
      await first.cleanup();
      await second.cleanup();
    }
  });

  it("leaves calendarFile undefined when the fixture has no calendar.json", async () => {
    const scratchRoot = await mkdtemp(join(tmpdir(), "agent-desk-eval-fixtures-"));
    try {
      await mkdir(join(scratchRoot, "notes-only", "notes"), { recursive: true });
      await writeFile(join(scratchRoot, "notes-only", "notes", "scratch.md"), "scratch", "utf8");

      const seeded = await seedFixture(scratchRoot, "notes-only");
      try {
        expect(seeded.calendarFile).toBeUndefined();
      } finally {
        await seeded.cleanup();
      }
    } finally {
      await rm(scratchRoot, { recursive: true, force: true });
    }
  });
});
