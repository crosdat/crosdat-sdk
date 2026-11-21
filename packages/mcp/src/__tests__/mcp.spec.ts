import type { ClinicalTransport } from '@crosdat/sdk';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import {
  ClinicalMcpToolName,
  MCP_PROTOCOL_VERSION,
  createClinicalKnowledgeMcpServer,
  runMcpStdioServer,
} from '../index.js';

function createStubTransport(): ClinicalTransport {
  return {
    createEmbedSession: vi.fn(),
    evaluateDifferentials: vi.fn(async () => ({
      triagePriority: 'EMERGENCY' as const,
      redFlags: [{ code: 'CONVULSIONS', severity: 'CRITICAL' as const, message: 'Active seizure' }],
      differentials: [],
      recommendedInvestigations: [],
      appliedFacilityOverrides: [],
      citations: [{ sourceId: 'who-imci', title: 'WHO IMCI Chart Booklet' }],
    })),
    evaluateDose: vi.fn(async () => ({
      medicationKey: 'artesunate',
      medicationName: 'Artesunate',
      route: 'IV',
      dosePerKg: 3.0,
      doseBasis: 'mg/kg/dose',
      calculatedSingleDose: 36,
      doseUnit: 'mg',
      cappedAtMaxSingleDose: false,
      frequencyLabel: 'At 0, 12, and 24 hours',
      codes: [],
      alerts: [],
      appliedFacilityOverrides: [],
      citations: [{ sourceId: 'who-malaria', title: 'WHO Malaria Guidelines' }],
    })),
    evaluateNeonatalTpn: vi.fn(async () => ({
      engineVersion: '1.0.0',
      parenteralVolumeMlPerDay: 150,
      aqueousRateMlPerHour: 5.7,
      lipidRateMlPerHour: 0.55,
      estimatedOsmolarityMosmPerL: 820,
      deliveredKcalPerKgDay: 88,
      deliveredGirMgKgMin: 6.0,
      compoundingLines: [],
      warnings: [],
      citations: [],
    })),
    evaluateGrowth: vi.fn(async () => ({
      standardUsed: 'WHO_CHILD_GROWTH' as const,
      indicators: [
        {
          indicator: 'WEIGHT_FOR_LENGTH_HEIGHT' as const,
          zScore: -3.4,
          percentile: 0.03,
          classification: 'Severe Acute Malnutrition',
          loincCode: '77607-0',
        },
      ],
      alerts: [],
      citations: [],
    })),
    listCalculators: vi.fn(async () => []),
    evaluateCalculator: vi.fn(async () => ({
      calculatorSlug: 'blantyre-coma-scale',
      title: 'Blantyre Coma Scale',
      score: 2,
      interpretation: 'Unrousable coma (< 3)',
      alerts: [],
      citations: [],
    })),
    searchGuidelines: vi.fn(async () => ({
      hits: [
        {
          slug: 'severe-malaria',
          kind: 'clinicalPlaybook' as const,
          title: 'Severe Malaria in Children',
          excerpt: 'Children weighing < 20 kg receive parenteral artesunate 3.0 mg/kg/dose.',
          codes: [],
          citation: { sourceId: 'who-malaria', title: 'WHO Guidelines for Malaria' },
        },
      ],
    })),
    startClinicalLearningSession: vi.fn(),
    submitClinicalLearningAttempt: vi.fn(),
  };
}

describe('@crosdat/mcp clinical knowledge server and composition', () => {
  it('registers all 6 clinical knowledge tools and supports .registerTool(...) composition', async () => {
    const transport = createStubTransport();
    const server = createClinicalKnowledgeMcpServer({ transport });

    const initialTools = server.listTools().map((t) => t.name);
    expect(initialTools).toEqual([
      ClinicalMcpToolName.SEARCH_GUIDELINES,
      ClinicalMcpToolName.EVALUATE_TRIAGE_AND_DIFFERENTIALS,
      ClinicalMcpToolName.CALCULATE_PAEDIATRIC_DOSE,
      ClinicalMcpToolName.CALCULATE_NEONATAL_TPN,
      ClinicalMcpToolName.COMPUTE_GROWTH_ZSCORE,
      ClinicalMcpToolName.RUN_CLINICAL_CALCULATOR,
    ]);

    server.registerTool({
      name: 'custom_domain_tool',
      description: 'Composed extension tool.',
      inputSchema: { type: 'object', properties: { ward: { type: 'string' } } },
      handler: async (args) => ({
        content: [{ type: 'text', text: `ward:${String(args.ward)}` }],
      }),
    });

    expect(server.listTools()).toHaveLength(7);
    expect(() =>
      server.registerTool({
        name: 'custom_domain_tool',
        description: 'Duplicate',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => ({ content: [] }),
      }),
    ).toThrow(/Duplicate MCP tool/);

    const doseRes = await server.callTool(ClinicalMcpToolName.CALCULATE_PAEDIATRIC_DOSE, {
      patient: { ageDays: 900, sex: 'FEMALE', weightKg: 12 },
      medicationKey: 'artesunate',
    });
    expect(doseRes.isError).toBeUndefined();
    expect(doseRes.structuredContent).toMatchObject({
      medicationKey: 'artesunate',
      calculatedSingleDose: 36,
    });

    const composedRes = await server.callTool('custom_domain_tool', { ward: 'NICU' });
    expect(composedRes.content[0]?.text).toBe('ward:NICU');

    const growthTool = server
      .listTools()
      .find((t) => t.name === ClinicalMcpToolName.COMPUTE_GROWTH_ZSCORE);
    expect(growthTool?.description).toContain('INTERGROWTH-21st');
    expect(growthTool?.description).toContain('Turner syndrome');
    expect(growthTool?.inputSchema.properties.conditionProfile).toBeDefined();
  });

  it('handles JSON-RPC 2.0 initialize, notifications, tools/list, tools/call, and stdio framing', async () => {
    const server = createClinicalKnowledgeMcpServer({ transport: createStubTransport() });

    const initReply = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {},
    });
    expect(initReply?.result).toMatchObject({
      protocolVersion: MCP_PROTOCOL_VERSION,
      serverInfo: { name: 'crosdat-clinical-mcp' },
    });

    // Notifications without `id` return null
    const notifReply = await server.handleJsonRpc({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    expect(notifReply).toBeNull();

    // Unknown tool returns structured isError: true result
    const unknownToolReply = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'nonexistent_tool', arguments: {} },
    });
    expect(unknownToolReply?.result).toMatchObject({ isError: true });

    // Test newline-delimited JSON-RPC over stdio streams
    const input = new PassThrough();
    const output = new PassThrough();
    const chunks: string[] = [];
    output.on('data', (chunk: Buffer) => chunks.push(chunk.toString('utf8')));

    const close = runMcpStdioServer(server, { input, output });
    input.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 77,
        method: 'tools/call',
        params: {
          name: ClinicalMcpToolName.SEARCH_GUIDELINES,
          arguments: { query: 'artesunate' },
        },
      })}\n`,
    );

    await new Promise((resolve) => setTimeout(resolve, 40));
    close();

    const parsed = JSON.parse(chunks.join('').trim()) as {
      id: number;
      result: { structuredContent: { hits: Array<{ slug: string }> } };
    };
    expect(parsed.id).toBe(77);
    expect(parsed.result.structuredContent.hits[0]?.slug).toBe('severe-malaria');
  });
});
