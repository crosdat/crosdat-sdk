import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin, UserConfig } from 'vite';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sdkRepoRoot = path.resolve(__dirname, '../..');
const packagesRoot = path.join(sdkRepoRoot, 'packages');

function resolveReactPkg(pkgName: 'react' | 'react-dom'): string {
  const candidates = [
    path.join(sdkRepoRoot, 'packages/react/node_modules', pkgName),
    path.join(sdkRepoRoot, 'node_modules', pkgName),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return path.dirname(require.resolve(`${pkgName}/package.json`));
}

function readDemoApiKey(): string {
  if (process.env.CROSDAT_DEMO_API_KEY?.trim()) {
    return process.env.CROSDAT_DEMO_API_KEY.trim();
  }
  const filePath = process.env.CROSDAT_DEMO_LICENSEE_FILE?.trim();
  if (filePath && fs.existsSync(filePath)) {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { apiKeySecret?: string };
    if (parsed.apiKeySecret) return parsed.apiKeySecret;
  }
  return '';
}

function hqGatewayBase(): string {
  const configured = (process.env.CROSDAT_HQ_API_BASE ?? process.env.VITE_HQ_API_BASE ?? 'http://127.0.0.1:18080/api').trim();
  return configured.replace(/\/+$/, '');
}

async function readRequestBody(req: AsyncIterable<Buffer | string>): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function crosdatHostDemoPlugin(): Plugin {
  return {
    name: 'crosdat-host-demo-middleware',
    configureServer(server) {
      server.middlewares.use('/__demo/mint-session', async (req, res, next) => {
        if (req.method !== 'POST') {
          next();
          return;
        }
        try {
          const apiKey = readDemoApiKey();
          if (!apiKey) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error: 'Set CROSDAT_DEMO_API_KEY or CROSDAT_DEMO_LICENSEE_FILE on the dev server to auto-mint demo sessions.',
              }),
            );
            return;
          }
          const rawBody = (await readRequestBody(req)).trim();
          const parsedBody = rawBody ? (JSON.parse(rawBody) as { origin?: string; module?: string }) : {};
          const origin = parsedBody.origin ?? req.headers.origin ?? 'http://127.0.0.1:18083';
          const module = parsedBody.module ?? 'all';
          const hqRes = await fetch(`${hqGatewayBase()}/v1/sessions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
              Origin: origin,
            },
            body: JSON.stringify({ module, origin }),
          });
          const payload = (await hqRes.json().catch(() => ({}))) as {
            data?: { sessionToken?: string; expiresAt?: string };
            sessionToken?: string;
            expiresAt?: string;
            message?: string;
          };
          if (!hqRes.ok) {
            res.statusCode = hqRes.status;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: payload.message ?? `HQ returned ${hqRes.status}`, payload }));
            return;
          }
          const data = payload.data ?? payload;
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              sessionToken: data.sessionToken,
              expiresAt: data.expiresAt ?? null,
              origin,
              module,
              apiKeyPrefix: `${apiKey.slice(0, 14)}...`,
            }),
          );
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
      });

      // Server-side proxy for headless HTTP /api/v1/* and SMART/CDS calls so host
      // pages never embed secret ck_live_* / ck_test_* keys in browser bundles.
      server.middlewares.use('/__demo/hq/', async (req, res, next) => {
        if (!req.url) {
          next();
          return;
        }
        try {
          const apiKey = readDemoApiKey();
          if (!apiKey) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'CROSDAT_DEMO_API_KEY / CROSDAT_DEMO_LICENSEE_FILE is not configured.' }));
            return;
          }
          const targetPath = req.url.replace(/^\/+/, '');
          const upstreamUrl = `${hqGatewayBase()}/${targetPath}`;
          const method = (req.method ?? 'GET').toUpperCase();
          const hasBody = method !== 'GET' && method !== 'HEAD';
          const bodyText = hasBody ? await readRequestBody(req) : undefined;
          const upstreamRes = await fetch(upstreamUrl, {
            method,
            headers: {
              Authorization: `Bearer ${apiKey}`,
              Origin: req.headers.origin ?? 'http://127.0.0.1:18083',
              ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
            },
            ...(hasBody && bodyText ? { body: bodyText } : {}),
          });
          const text = await upstreamRes.text();
          res.statusCode = upstreamRes.status;
          res.setHeader('Content-Type', upstreamRes.headers.get('content-type') ?? 'application/json');
          res.end(text);
        } catch (err) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
      });
    },
  };
}

const config: UserConfig = {
  plugins: [crosdatHostDemoPlugin()],
  esbuild: {
    jsx: 'automatic',
  },
  server: {
    host: '127.0.0.1',
    port: Number(process.env.HOST_DEMO_PORT ?? 18083),
    strictPort: true,
    fs: {
      allow: [__dirname, sdkRepoRoot],
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      react: resolveReactPkg('react'),
      'react-dom': resolveReactPkg('react-dom'),
      '@crosdat/react/headless': path.join(packagesRoot, 'react/dist/headless/index.js'),
      '@crosdat/react': path.join(packagesRoot, 'react/dist/index.js'),
      '@crosdat/embed/frame': path.join(packagesRoot, 'embed/dist/frame.js'),
      '@crosdat/embed': path.join(packagesRoot, 'embed/dist/index.js'),
      '@crosdat/sdk/dpop': path.join(packagesRoot, 'sdk/dist/dpop.js'),
      '@crosdat/sdk/types': path.join(packagesRoot, 'sdk/dist/types.js'),
      '@crosdat/sdk/enums': path.join(packagesRoot, 'sdk/dist/enums.js'),
      '@crosdat/sdk': path.join(packagesRoot, 'sdk/dist/index.js'),
    },
  },
};

export default config;
