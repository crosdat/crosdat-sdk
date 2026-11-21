import type { ClinicalTransport, FacilityClinicalOverridesInput } from '@crosdat/sdk';
import { createInterface } from 'node:readline';
import {
  buildReferenceClinicalMcpTools,
  type McpCallToolResult,
  type McpJsonSchema,
  type McpToolDefinition,
} from './tools.js';

/**
 * Ordered list of MCP protocol revisions supported by {@link ClinicalKnowledgeMcpServer},
 * from newest (`2025-06-18` Streamable-HTTP) to legacy (`2024-11-05`).
 */
export const SUPPORTED_MCP_PROTOCOL_VERSIONS = [
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
] as const;

/**
 * Supported MCP protocol revision identifier.
 */
export type McpProtocolVersion = (typeof SUPPORTED_MCP_PROTOCOL_VERSIONS)[number];

/**
 * Default MCP protocol version advertised when no supported `protocolVersion` is specified.
 */
export const MCP_PROTOCOL_VERSION: McpProtocolVersion = '2025-06-18';

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
 * Optional invocation context forwarded from JSON-RPC `params._meta` or HTTP headers.
 */
export interface McpInvocationContext {
  /** W3C Trace Context `traceparent` header or `_meta.traceparent` value when provided. */
  traceparent?: string;
}

/**
 * HTTP request descriptor accepted by {@link handleMcpHttpRequest}.
 */
export interface McpHttpRequest {
  /** HTTP request method (`POST`, `GET`, `DELETE`, etc.). */
  method: string;
  /** Case-insensitive HTTP headers map. */
  headers?: Record<string, string | string[] | undefined>;
  /** Parsed JSON-RPC payload (or raw JSON string) for `POST` requests. */
  body?: unknown;
}

/**
 * Framework-agnostic HTTP response returned by {@link handleMcpHttpRequest}.
 */
export interface McpHttpResponse {
  /** HTTP status code (`200`, `202`, `400`, `405`, etc.). */
  status: number;
  /** Outbound HTTP headers including `MCP-Protocol-Version` and `Content-Type`. */
  headers: Record<string, string>;
  /** Serialized JSON-RPC response body (`undefined` for `202 Accepted` notifications). */
  body?: JsonRpcResponse | JsonRpcResponse[] | { error: string };
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
  /** Optional hook receiving extracted W3C `traceparent` context per JSON-RPC call. */
  onTraceContext?: (context: McpInvocationContext & { method: string; toolName?: string }) => void;
}

/**
 * Negotiates the effective MCP protocol version against {@link SUPPORTED_MCP_PROTOCOL_VERSIONS}.
 *
 * @param requested - Client-requested version from `initialize` params or `MCP-Protocol-Version` header.
 * @returns Matched supported version, or the latest `2025-06-18` default when omitted/unknown.
 */
export function negotiateMcpProtocolVersion(requested?: unknown): McpProtocolVersion {
  if (typeof requested === 'string') {
    const trimmed = requested.trim();
    if ((SUPPORTED_MCP_PROTOCOL_VERSIONS as readonly string[]).includes(trimmed)) {
      return trimmed as McpProtocolVersion;
    }
  }
  return MCP_PROTOCOL_VERSION;
}

/**
 * Extracts a W3C `traceparent` identifier from MCP `params._meta.traceparent` or
 * an HTTP `traceparent` header when present.
 *
 * @param params - JSON-RPC `params` object.
 * @param headerTraceparent - Optional `traceparent` HTTP header value.
 * @returns Trimmed `traceparent` string when valid and non-empty, otherwise `undefined`.
 */
export function extractMcpTraceparent(
  params?: Record<string, unknown>,
  headerTraceparent?: string,
): string | undefined {
  const meta = params?._meta;
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    const candidate = (meta as Record<string, unknown>).traceparent;
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  if (typeof headerTraceparent === 'string' && headerTraceparent.trim().length > 0) {
    return headerTraceparent.trim();
  }
  return undefined;
}

function readHeader(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) {
      if (Array.isArray(value)) return value[0];
      return value;
    }
  }
  return undefined;
}

/**
 * Extensible Model Context Protocol (MCP) server exposing the 7 stateless
 * CROSDAT reference clinical knowledge tools and allowing downstream hosts to
 * compose additional domain tools via {@link registerTool}.
 */
export class ClinicalKnowledgeMcpServer {
  private readonly tools = new Map<string, McpToolDefinition>();
  public readonly serverName: string;
  public readonly serverVersion: string;
  private readonly onTraceContext?: ClinicalKnowledgeMcpServerOptions['onTraceContext'];

  /**
   * Constructs a `ClinicalKnowledgeMcpServer` pre-loaded with the 7 reference
   * clinical tools and any optional `additionalTools`.
   *
   * @param options - Transport, server metadata, facility overrides, and extra tools.
   */
  constructor(options: ClinicalKnowledgeMcpServerOptions) {
    this.serverName = options.serverName ?? 'crosdat-clinical-mcp';
    this.serverVersion = options.serverVersion ?? '0.1.0';
    this.onTraceContext = options.onTraceContext;

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
   * `tools/list`, `tools/call`, or notifications) and extracts W3C `traceparent`
   * propagation metadata from `params._meta`.
   *
   * @param request - Parsed JSON-RPC 2.0 envelope.
   * @param context - Optional invocation context (for example HTTP `traceparent` fallback).
   * @returns JSON-RPC response envelope, or `null` for one-way notifications.
   */
  public async handleJsonRpc(
    request: JsonRpcRequest,
    context?: McpInvocationContext,
  ): Promise<JsonRpcResponse | null> {
    const traceparent = extractMcpTraceparent(request.params, context?.traceparent);
    if (traceparent && this.onTraceContext) {
      const toolName =
        request.method === 'tools/call' && typeof request.params?.name === 'string'
          ? request.params.name
          : undefined;
      this.onTraceContext({ traceparent, method: request.method, toolName });
    }

    if (request.id === undefined) {
      // JSON-RPC notifications (such as `notifications/initialized`) expect no reply.
      return null;
    }

    try {
      switch (request.method) {
        case 'initialize': {
          const negotiatedVersion = negotiateMcpProtocolVersion(request.params?.protocolVersion);
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              protocolVersion: negotiatedVersion,
              capabilities: {
                tools: { listChanged: false },
              },
              serverInfo: {
                name: this.serverName,
                version: this.serverVersion,
              },
            },
          };
        }

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
 * Handles an incoming MCP Streamable-HTTP (`2025-06-18` / `2025-03-26` / `2024-11-05`)
 * HTTP request against a {@link ClinicalKnowledgeMcpServer}, negotiating the
 * `MCP-Protocol-Version` response header, forwarding W3C `traceparent` context
 * from `params._meta` or HTTP headers, and returning framework-agnostic status,
 * headers, and JSON-RPC body.
 *
 * @param server - Configured `ClinicalKnowledgeMcpServer` instance.
 * @param req - Incoming HTTP method, headers, and parsed/raw JSON-RPC body.
 * @returns HTTP status, headers (`MCP-Protocol-Version`, `traceparent` when present), and body.
 */
export async function handleMcpHttpRequest(
  server: ClinicalKnowledgeMcpServer,
  req: McpHttpRequest,
): Promise<McpHttpResponse> {
  const method = req.method.toUpperCase();
  const requestedHeaderVersion = readHeader(req.headers, 'mcp-protocol-version');

  if (
    requestedHeaderVersion &&
    !(SUPPORTED_MCP_PROTOCOL_VERSIONS as readonly string[]).includes(requestedHeaderVersion.trim())
  ) {
    return {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
      },
      body: { error: `Unsupported MCP-Protocol-Version: ${requestedHeaderVersion}` },
    };
  }

  let protocolVersion = negotiateMcpProtocolVersion(requestedHeaderVersion);
  const headerTraceparent = readHeader(req.headers, 'traceparent');

  if (method !== 'POST') {
    return {
      status: 405,
      headers: {
        Allow: 'POST',
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': protocolVersion,
      },
      body: { error: `Method ${method} not allowed; use POST for stateless MCP Streamable-HTTP.` },
    };
  }

  let parsedBody: unknown = req.body;
  if (typeof req.body === 'string') {
    try {
      parsedBody = JSON.parse(req.body);
    } catch {
      return {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': protocolVersion,
        },
        body: {
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error' },
        },
      };
    }
  }

  if (!parsedBody || typeof parsedBody !== 'object') {
    return {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': protocolVersion,
      },
      body: {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'Invalid Request' },
      },
    };
  }

  const processSingle = async (
    rpc: JsonRpcRequest,
  ): Promise<{ response: JsonRpcResponse | null; traceparent?: string }> => {
    const extractedTraceparent = extractMcpTraceparent(rpc.params, headerTraceparent);
    const response = await server.handleJsonRpc(rpc, { traceparent: extractedTraceparent });
    if (
      rpc.method === 'initialize' &&
      response?.result &&
      typeof response.result === 'object' &&
      'protocolVersion' in response.result
    ) {
      protocolVersion = negotiateMcpProtocolVersion(
        (response.result as { protocolVersion?: unknown }).protocolVersion,
      );
    }
    return { response, traceparent: extractedTraceparent };
  };

  if (Array.isArray(parsedBody)) {
    const items = await Promise.all(parsedBody.map((item) => processSingle(item as JsonRpcRequest)));
    const replies = items
      .map((item) => item.response)
      .filter((r): r is JsonRpcResponse => r !== null);
    const firstTraceparent = items.find((item) => item.traceparent)?.traceparent;
    const responseHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': protocolVersion,
      ...(firstTraceparent ? { traceparent: firstTraceparent } : {}),
    };
    if (replies.length === 0) {
      return { status: 202, headers: responseHeaders };
    }
    return { status: 200, headers: responseHeaders, body: replies };
  }

  const { response, traceparent } = await processSingle(parsedBody as JsonRpcRequest);
  const responseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'MCP-Protocol-Version': protocolVersion,
    ...(traceparent ? { traceparent } : {}),
  };

  if (!response) {
    return { status: 202, headers: responseHeaders };
  }

  return {
    status: 200,
    headers: responseHeaders,
    body: response,
  };
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
