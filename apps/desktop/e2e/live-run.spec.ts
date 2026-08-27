import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Exercises the real Phase 7 pipeline end to end: renderer -> IPC -> main
// -> utility process -> real runAgent -> real Anthropic API -> streamed
// AgentEvents -> chat-core reducer -> React. Needs ANTHROPIC_API_KEY and
// costs real tokens, so — unlike smoke.spec.ts — this skips gracefully
// without one instead of failing CI for everyone who hasn't configured it.
const hasApiKey = Boolean(process.env["ANTHROPIC_API_KEY"]);

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..");

async function launchApp(): Promise<ElectronApplication> {
  return electron.launch({ args: [appRoot], env: { ...process.env, ELECTRON_RUN_AS_NODE: "" } });
}

test.skip(!hasApiKey, "needs ANTHROPIC_API_KEY");

test("a real run streams a tool-call timeline and a final answer into the UI", async () => {
  test.setTimeout(60_000);
  const app = await launchApp();
  try {
    const page = await app.firstWindow();
    await page.fill("input", "List my calendar events and note titles, briefly.");
    await page.click("#run");

    await page.waitForFunction(
      () => document.getElementById("live-region")?.textContent === "Response complete",
      undefined,
      { timeout: 45_000 },
    );

    const toolNames = await page.locator(".tool-name").allTextContents();
    expect(toolNames).toEqual(expect.arrayContaining(["calendar.list", "notes.list"]));
    await expect(page.locator(".tool-card").first()).toHaveClass(/tool-done/);
    expect((await page.locator(".msg-text").allTextContents()).join(" ")).toContain("q3-plan");
  } finally {
    await app.close();
  }
});

test("cancel preserves the prior turn instead of erasing the conversation", async () => {
  test.setTimeout(90_000);
  const app = await launchApp();
  try {
    const page = await app.firstWindow();

    await page.fill("input", "Say hello in exactly three words.");
    await page.click("#run");
    await page.waitForFunction(
      () => document.getElementById("live-region")?.textContent === "Response complete",
      undefined,
      { timeout: 45_000 },
    );
    const firstReplyCount = await page.locator(".msg-text").count();
    expect(firstReplyCount).toBeGreaterThan(0);

    await page.fill("input", "Write a very long, detailed report about your calendar and notes, at least 10 paragraphs.");
    await page.click("#run");
    await page.waitForSelector("#cancel-run", { timeout: 10_000 });
    await page.click("#cancel-run");

    await page.waitForFunction(
      () => document.getElementById("live-region")?.textContent === "Run cancelled",
      undefined,
      { timeout: 10_000 },
    );
    // The first turn's reply is still there — cancelling the second one
    // doesn't wipe the conversation. The composer goes back to "Run" (not
    // "Cancel") once the run is no longer active — the empty-prompt
    // disabled state (run() clears the input) is separate and expected.
    expect(await page.locator(".msg-text").count()).toBeGreaterThanOrEqual(firstReplyCount);
    await expect(page.locator("#run")).toBeVisible();
  } finally {
    await app.close();
  }
});
