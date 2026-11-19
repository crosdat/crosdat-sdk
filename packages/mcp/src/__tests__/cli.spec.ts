import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startCliMcpServer } from '../cli.js';
import { ClinicalMcpToolName } from '../tools.js';

describe('startCliMcpServer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses Bearer API key authentication without DPoP headers over HTTP transport', async () => {
    const requests: Array<{ url: string; headers: Headers }> = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      requests.push({ url, headers: new Headers(init?.headers) });
      return new Response(
        JSON.stringify({
          data: {
            hits: [
              {
                slug: 'severe-malaria',
                title: 'Severe malaria',
                category: 'guideline',
                excerpt: 'IV artesunate',
                sectionTitle: 'Management',
                score: 0.99,
              },
            ],
            total: 1,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const input = new PassThrough();
    const output = new PassThrough();
    const chunks: string[] = [];
    output.on('data', (chunk: Buffer) => chunks.push(chunk.toString('utf8')));

    const close = startCliMcpServer(
      {
        CROSDAT_API_KEY: 'ck_test_cli_key',
        CROSDAT_API_BASE_URL: 'https://gateway.example.test/api/v1',
      },
      { input, output },
    );

    input.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: ClinicalMcpToolName.SEARCH_GUIDELINES,
          arguments: { query: 'artesunate' },
        },
      })}\n`,
    );

    await new Promise((resolve) => setTimeout(resolve, 40));
    close();

    expect(requests.length).toBe(1);
    expect(requests[0]?.url).toBe(
      'https://gateway.example.test/api/v1/guidelines/search?query=artesunate',
    );
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer ck_test_cli_key');
    expect(requests[0]?.headers.get('dpop')).toBeNull();

    const response = JSON.parse(chunks.join('').trim()) as {
      id: number;
      result: { isError?: boolean; structuredContent: { hits: Array<{ slug: string }> } };
    };
    expect(response.id).toBe(1);
    expect(response.result.isError).not.toBe(true);
    expect(response.result.structuredContent.hits[0]?.slug).toBe('severe-malaria');
  });
});
