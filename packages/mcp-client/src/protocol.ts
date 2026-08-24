import { z } from "zod";

// MCP 2026-07-28: stateless. No initialize handshake — protocol version and
// capabilities travel on every request instead (see McpClient.request).
export const MCP_PROTOCOL_VERSION = "2026-07-28";

export const jsonRpcIdSchema = z.union([z.string(), z.number()]);

export const jsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: jsonRpcIdSchema,
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});
export type JsonRpcRequest = z.infer<typeof jsonRpcRequestSchema>;

// resultType is optional in the schema even though current servers MUST send
// it — the spec requires clients to treat an absent resultType as "complete"
// for compatibility with servers on earlier protocol revisions.
export const jsonRpcResultResponseSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: jsonRpcIdSchema,
  result: z.object({ resultType: z.string().optional() }).catchall(z.unknown()),
});
export type JsonRpcResultResponse = z.infer<typeof jsonRpcResultResponseSchema>;

export const jsonRpcErrorResponseSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: jsonRpcIdSchema.nullable().optional(),
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: z.unknown().optional(),
  }),
});
export type JsonRpcErrorResponse = z.infer<typeof jsonRpcErrorResponseSchema>;

export const jsonRpcResponseSchema = z.union([jsonRpcResultResponseSchema, jsonRpcErrorResponseSchema]);
export type JsonRpcResponse = z.infer<typeof jsonRpcResponseSchema>;

export const jsonRpcNotificationSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});
export type JsonRpcNotification = z.infer<typeof jsonRpcNotificationSchema>;
