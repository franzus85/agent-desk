import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION } from "./index.js";

describe("protocol package skeleton", () => {
  it("builds and runs under the workspace test runner", () => {
    expect(PROTOCOL_VERSION).toBe(0);
  });
});
