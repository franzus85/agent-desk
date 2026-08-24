import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { JsonRpcRequest } from "./protocol.js";
import type { McpTransport } from "./transport.js";

export class McpTransportError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "McpTransportError";
  }
}

export class McpServerExitedError extends McpTransportError {
  constructor(
    public readonly exitCode: number | null,
    public readonly signal: NodeJS.Signals | null,
  ) {
    super(`MCP server process exited (code=${exitCode}, signal=${signal})`);
    this.name = "McpServerExitedError";
  }
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

export interface StdioTransportOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export class StdioTransport implements McpTransport {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<string | number, PendingRequest>();
  private buffer = "";
  private closed = false;

  constructor(command: string, args: string[] = [], options: StdioTransportOptions = {}) {
    this.child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: options.cwd,
      env: options.env,
    });
    this.child.stdout.on("data", (chunk: Buffer) => this.handleStdout(chunk));
    this.child.stderr.on("data", (chunk: Buffer) => {
      process.stderr.write(`[mcp server stderr] ${chunk.toString("utf8")}`);
    });
    this.child.on("exit", (code, signal) => this.handleTermination(new McpServerExitedError(code, signal)));
    this.child.on("error", (error) => this.handleTermination(new McpTransportError("MCP server process failed to start", error)));
  }

  async send(message: JsonRpcRequest): Promise<unknown> {
    if (this.closed) {
      throw new McpTransportError("Cannot send on a closed stdio transport.");
    }
    return new Promise((resolve, reject) => {
      this.pending.set(message.id, { resolve, reject });
      this.child.stdin.write(`${JSON.stringify(message)}\n`, (error) => {
        if (error) {
          this.pending.delete(message.id);
          reject(new McpTransportError("Failed to write to MCP server stdin", error));
        }
      });
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.child.kill();
  }

  private handleStdout(chunk: Buffer): void {
    this.buffer += chunk.toString("utf8");
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) this.handleLine(line);
    }
  }

  private handleLine(line: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      process.stderr.write(`[mcp-client] Ignoring non-JSON line from server: ${line}\n`);
      return;
    }

    const id = (parsed as { id?: string | number }).id;
    if (id === undefined) return; // notification or other message we're not waiting on

    const request = this.pending.get(id);
    if (!request) return; // no matching pending request; drop it

    this.pending.delete(id);
    request.resolve(parsed);
  }

  private handleTermination(error: McpTransportError): void {
    this.closed = true;
    for (const request of this.pending.values()) {
      request.reject(error);
    }
    this.pending.clear();
  }
}
