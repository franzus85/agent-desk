import { z } from "zod";

export const McpErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  HeaderMismatch: -32020,
  MissingRequiredClientCapability: -32021,
  UnsupportedProtocolVersion: -32022,
} as const;

export class McpError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = "McpError";
  }
}

const missingCapabilityDataSchema = z.object({ requiredCapabilities: z.array(z.string()) });

export class MissingRequiredClientCapabilityError extends McpError {
  public readonly requiredCapabilities: string[];

  constructor(message: string, data: unknown) {
    super(McpErrorCode.MissingRequiredClientCapability, message, data);
    this.name = "MissingRequiredClientCapabilityError";
    const parsed = missingCapabilityDataSchema.safeParse(data);
    this.requiredCapabilities = parsed.success ? parsed.data.requiredCapabilities : [];
  }
}

export function toMcpError(error: { code: number; message: string; data?: unknown }): McpError {
  if (error.code === McpErrorCode.MissingRequiredClientCapability) {
    return new MissingRequiredClientCapabilityError(error.message, error.data);
  }
  return new McpError(error.code, error.message, error.data);
}
