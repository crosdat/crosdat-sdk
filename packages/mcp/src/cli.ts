#!/usr/bin/env node
import { createCrosdatClient } from '@crosdat/sdk';
import { createClinicalKnowledgeMcpServer, runMcpStdioServer } from './server.js';

/**
 * Starts the standalone CROSDAT Clinical Knowledge MCP server over stdio using
 * `CROSDAT_API_KEY` and `CROSDAT_API_BASE_URL` environment variables.
 *
 * @param env - Process environment dictionary (defaults to `process.env`).
 * @returns Cleanup callback closing the stdio listener.
 */
export function startCliMcpServer(env: NodeJS.ProcessEnv = process.env): () => void {
  const apiKey = env.CROSDAT_API_KEY;
  if (!apiKey) {
    process.stderr.write(
      'Error: CROSDAT_API_KEY environment variable is required to start crosdat-mcp.\n',
    );
    process.exit(1);
  }
  const baseUrl = env.CROSDAT_API_BASE_URL ?? 'https://api.crosdat.com/api/v1';
  const client = createCrosdatClient({
    baseUrl,
    apiKey,
    enableDpop: true,
  });
  const server = createClinicalKnowledgeMcpServer({ transport: client });
  return runMcpStdioServer(server);
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  Boolean(process.argv[1]) &&
  (process.argv[1]!.endsWith('/cli.js') || process.argv[1]!.endsWith('/crosdat-mcp'));

if (isDirectExecution) {
  startCliMcpServer();
}
