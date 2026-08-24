import type { JsonRpcRequest } from "./protocol.js";

// Deliberately narrow: a transport only knows how to move one request's bytes
// and hand back the raw reply. Correlating a reply to its request is a
// transport-specific concern (trivial for HTTP, real work for a shared stdio
// stream) and stays out of McpClient, which validates the raw result itself.
export interface McpTransport {
  send(message: JsonRpcRequest): Promise<unknown>;
}
