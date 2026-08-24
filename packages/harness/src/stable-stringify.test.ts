import { describe, expect, it } from "vitest";
import { stableStringify } from "./stable-stringify.js";

describe("stableStringify", () => {
  it("produces identical output regardless of key order", () => {
    const a = stableStringify({ query: "q3", limit: 5 });
    const b = stableStringify({ limit: 5, query: "q3" });
    expect(a).toBe(b);
  });

  it("sorts keys in nested objects too", () => {
    const a = stableStringify({ outer: { b: 1, a: 2 } });
    const b = stableStringify({ outer: { a: 2, b: 1 } });
    expect(a).toBe(b);
  });

  it("distinguishes genuinely different values", () => {
    expect(stableStringify({ query: "q3" })).not.toBe(stableStringify({ query: "q4" }));
  });
});
