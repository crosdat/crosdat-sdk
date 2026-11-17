import type { ClinicalTransport, FacilityClinicalOverridesInput } from '@crosdat/sdk';
import { createInterface } from 'node:readline';
import {
  buildReferenceClinicalMcpTools,
  type McpCallToolResult,
  type McpJsonSchema,
  type McpToolDefinition,
} from './tools.js';

/**
 * Supported MCP protocol version negotiated during `initialize`.
 */
export const MCP_PROTOCOL_VERSION = '2024-11-05' as const;

/**
 * JSON-RPC 2.0 request or notification envelope used by Model Context Protocol transports.
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC 2.0 response envelope emitted by {@link ClinicalKnowledgeMcpServer}.
 */
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Configuration options for {@link createClinicalKnowledgeMcpServer}.
 */
export interface ClinicalKnowledgeMcpServerOptions {
  /** Underlying `CrosdatClient` or custom `ClinicalTransport`. */
  transport: ClinicalTransport;
  /** Optional server name advertised in `initialize` (defaults to `'crosdat-clinical-mcp'`). */
  serverName?: string;
  /** Optional server version advertised in `initialize` (defaults to `'0.1.0'`). */
  serverVersion?: string;
  /** Optional default facility clinical overrides applied to reference calculations. */
  facilityOverrides?: FacilityClinicalOverridesInput;
  /** Optional additional domain tools composed onto the base server. */
  additionalTools?: McpToolDefinition[];
}

/**
 * Extensible Model Context Protocol (MCP) server exposing the 6 stateless
 * CROSDAT reference clinical knowledge tools and allowing downstream hosts to
 * compose additional domain tools via {@link registerTool}.
 */
export class ClinicalKnowledgeMcpServer {
  private readonly tools = new Map<string, McpToolDefinition>();
  public readonly serverName: string;
  public readonly serverVersion: string;

  /**
   * Constructs a `ClinicalKnowledgeMcpServer` pre-loaded with the 6 reference
   * clinical tools and any optional `additionalTools`.
   *
   * @param options - Transport, server metadata, facility overrides, and extra tools.
   */
  constructor(options: ClinicalKnowledgeMcpServerOptions) {
    this.serverName = options.serverName ?? 'crosdat-clinical-mcp';
    this.serverVersion = options.serverVersion ?? '0.1.0';

    for (const tool of buildReferenceClinicalMcpTools(
      options.transport,
      options.facilityOverrides,
    )) {
      this.registerTool(tool);
    }

    if (options.additionalTools) {
      for (const extra of options.additionalTools) {
        this.registerTool(extra);
      }
    }
  }

  /**
   * Registers an additional MCP tool on this server instance (for example when
   * composing domain-specific tools over the base reference clinical tools).
   *
   * @param definition - Tool name, description, JSON Schema, and async handler.
   * @returns `this` for fluent chaining.
   */
  public registerTool<TArgs = Record<string, unknown>>(
    definition: McpToolDefinition<TArgs>,
  ): this {
    if (this.tools.has(definition.name)) {
      throw new Error(`Duplicate MCP tool registration: ${definition.name}`);
    }
    this.tools.set(definition.name, definition as McpToolDefinition);
    return this;
  }

  /**
   * Lists all registered tool descriptors in MCP `tools/list` wire format.
   *
   * @returns Array of tool metadata (`name`, `description`, `inputSchema`).
   */
  public listTools(): Array<{
    name: string;
    description: string;
    inputSchema: McpJsonSchema;
  }> {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  /**
   * Executes a registered MCP tool by name and converts thrown errors into
   * structured MCP `isError: true` tool results so AI agents receive actionable
   * diagnostics rather than transport disconnects.
   *
   * @param name - Registered tool name.
   * @param args - Structured input object matching the tool's `inputSchema`.
   * @returns MCP `CallToolResult` containing serialized text and `structuredContent`.
   */
  public async callTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<McpCallToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Unknown MCP tool: ${name}` }],
      };
    }

    try {
      return await tool.handler(args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: 'text', text: `Tool execution failed (${name}): ${message}` }],
      };
    }
  }

  /**
   * Processes a single JSON-RPC 2.0 MCP message (`initialize`, `ping`,
   * `tools/list`, `tools/call`, or notifications).
   *
   * @param request - Parsed JSON-RPC 2.0 envelope.
   * @returns JSON-RPC response envelope, or `null` for one-way notifications.
   */
  public async handleJsonRpc(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    if (request.id === undefined) {
      // JSON-RPC notifications (such as `notifications/initialized`) expect no reply.
      return null;
    }

    try {
      switch (request.method) {
        case 'initialize':
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              protocolVersion: MCP_PROTOCOL_VERSION,
              capabilities: {
                tools: { listChanged: false },
              },
              serverInfo: {
                name: this.serverName,
                version: this.serverVersion,
              },
            },
          };

        case 'ping':
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {},
          };

        case 'tools/list':
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              tools: this.listTools(),
            },
          };

        case 'tools/call': {
          const toolName =
            typeof request.params?.name === 'string' ? request.params.name : '';
          const toolArgs =
            request.params?.arguments && typeof request.params.arguments === 'object'
              ? (request.params.arguments as Record<string, unknown>)
              : {};
          if (!toolName) {
            return {
              jsonrpc: '2.0',
              id: request.id,
              error: {
                code: -32602,
                message: 'Invalid params: `name` is required for tools/call.',
              },
            };
          }
          const result = await this.callTool(toolName, toolArgs);
          return {
            jsonrpc: '2.0',
            id: request.id,
            result,
          };
        }

        default:
          return {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32601,
              message: `Method not found: ${request.method}`,
            },
          };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message,
        },
      };
    }
  }
}

/**
 * Factory creating a {@link ClinicalKnowledgeMcpServer} over any `ClinicalTransport`.
 *
 * @param options - Transport, server metadata, and optional composed tools.
 * @returns Configured `ClinicalKnowledgeMcpServer` instance.
 */
export function createClinicalKnowledgeMcpServer(
  options: ClinicalKnowledgeMcpServerOptions,
): ClinicalKnowledgeMcpServer {
  return new ClinicalKnowledgeMcpServer(options);
}

/**
 * Binds a {@link ClinicalKnowledgeMcpServer} to standard input/output using
 * MCP newline-delimited JSON-RPC 2.0 framing for Claude Desktop, Cursor,
 * OpenAI Agents SDK, and LangGraph hosts.
 *
 * @param server - Configured MCP server instance.
 * @param io - Optional readable/writable streams (defaults to `process.stdin` / `process.stdout`).
 * @returns Cleanup function closing the readline listener.
 */
export function runMcpStdioServer(
  server: ClinicalKnowledgeMcpServer,
  io: {
    input?: NodeJS.ReadableStream;
    output?: NodeJS.WritableStream;
  } = {},
): () => void {
  const input = io.input ?? process.stdin;
  const output = io.output ?? process.stdout;
  const rl = createInterface({ input, crlfDelay: Infinity });

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let parsed: JsonRpcRequest;
    try {
      parsed = JSON.parse(trimmed) as JsonRpcRequest;
    } catch {
      const parseErr: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      };
      output.write(`${JSON.stringify(parseErr)}\n`);
      return;
    }

    void server.handleJsonRpc(parsed).then((response) => {
      if (response) {
        output.write(`${JSON.stringify(response)}\n`);
      }
    });
  });

  return () => {
    rl.close();
  };
}
