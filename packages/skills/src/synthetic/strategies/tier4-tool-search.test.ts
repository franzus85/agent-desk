import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { discoveredToolNames } from "./tier4-tool-search.js";

function toolSearchResultBlock(toolNames: string[]) {
  return {
    type: "tool_search_tool_result",
    tool_use_id: "srvtoolu_test",
    content: {
      type: "tool_search_tool_search_result",
      tool_references: toolNames.map((name) => ({ type: "tool_reference", tool_name: name })),
    },
  };
}

describe("discoveredToolNames", () => {
  it("extracts and maps api tool names back to skill names", () => {
    const content = [toolSearchResultBlock(["crm__search_contact", "crm__search_deal"])] as unknown as Anthropic.ContentBlock[];
    expect(discoveredToolNames(content)).toEqual(["crm.search_contact", "crm.search_deal"]);
  });

  it("dedupes across multiple search results, preserving first-seen order", () => {
    const content = [
      toolSearchResultBlock(["crm__search_contact"]),
      toolSearchResultBlock(["crm__search_deal", "crm__search_contact"]),
    ] as unknown as Anthropic.ContentBlock[];
    expect(discoveredToolNames(content)).toEqual(["crm.search_contact", "crm.search_deal"]);
  });

  it("ignores non-search-result blocks", () => {
    const content = [{ type: "text", text: "hi" }] as unknown as Anthropic.ContentBlock[];
    expect(discoveredToolNames(content)).toEqual([]);
  });
});
