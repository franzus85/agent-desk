// Thrown by a Tool handler that needs more information from the user before
// it can finish — e.g. "this would overwrite an existing note, proceed?".
// The MCP server layer (packages/mcp-server-kit) catches this and turns it
// into a resultType: "input_required" response per the MRTR pattern; a
// purely local (non-MCP) caller can catch it directly too.
export class ElicitationRequired extends Error {
  constructor(
    message: string,
    public readonly requestedSchema: unknown,
  ) {
    super(message);
    this.name = "ElicitationRequired";
  }
}
