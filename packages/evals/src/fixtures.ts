import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathExists } from "./fs-utils.js";

export interface SeededFixture {
  // Points a fresh MCP_NOTES_DATA_DIR at a private copy of the fixture's
  // notes, so repeated runs (pass^k needs N of them) never see each other's
  // writes and never mutate the checked-in fixture.
  notesDir: string;
  // Read-only, so the fixture file itself can be handed straight to
  // MCP_CALENDAR_DATA_FILE — no copy needed.
  calendarFile: string | undefined;
  cleanup: () => Promise<void>;
}

export async function seedFixture(fixturesRoot: string, name: string): Promise<SeededFixture> {
  const fixtureDir = join(fixturesRoot, name);
  const notesDir = await mkdtemp(join(tmpdir(), `agent-desk-eval-${name}-`));

  const sourceNotesDir = join(fixtureDir, "notes");
  if (await pathExists(sourceNotesDir)) {
    await cp(sourceNotesDir, notesDir, { recursive: true });
  }

  const calendarFile = join(fixtureDir, "calendar.json");

  return {
    notesDir,
    calendarFile: (await pathExists(calendarFile)) ? calendarFile : undefined,
    cleanup: () => rm(notesDir, { recursive: true, force: true }),
  };
}
