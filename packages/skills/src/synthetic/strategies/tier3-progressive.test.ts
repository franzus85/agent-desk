import { describe, expect, it } from "vitest";
import { domains } from "../domains.js";
import { domainIndexTools } from "./tier3-progressive.js";

describe("domainIndexTools", () => {
  it("produces one API-safe, uniquely-named tool per domain", () => {
    const tools = domainIndexTools();
    expect(tools).toHaveLength(domains.length);
    for (const tool of tools) {
      expect(tool.name).toMatch(/^[a-zA-Z0-9_-]{1,128}$/);
    }
    expect(new Set(tools.map((tool) => tool.name)).size).toBe(tools.length);
  });
});
