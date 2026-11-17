import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');

/**
 * SHA-256 digests of forbidden internal repository names and private hostnames.
 * Stored as hashes so this public guardrail test never spells internal names itself.
 */
const FORBIDDEN_TOKEN_SHA256 = new Set([
  '2dd8d935df78d7c15a80484664c0db393f84939203cc57ac1ae17a5a30b21c76',
  '53ffd94f986fdfa860eee8f2bdab79feb46fa335f9140f2544d8e474a854801d',
  '2b5b10a6b21c705b107eed6c9e5531d3262ee84fc7e156458bd489e046dade44',
  '57b4ff4c20ea0d81382ca3ec20284c78d745f09ce9ebbe772665e4c0386e9b92',
  '652e7d4aac1e853ac937678e61306157dca8e49ee0e34e434e88febedea4da57',
  '62b02396970f01f1781a2919a7dad4f9dc94f8863d1509e7ef64e28ed43f0adc',
  'c92415343122b198e94a6261f07ce4e4450f7ecd33a763b8d920a5e8237a0806',
]);

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', '.turbo']);
const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.json',
  '.md',
  '.yaml',
  '.yml',
  '.html',
]);

function collectFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectFiles(full, acc);
    } else if (TEXT_EXTENSIONS.has(extname(entry)) || entry === 'AGENTS.md') {
      acc.push(full);
    }
  }
  return acc;
}

describe('public repository hygiene and boundary guardrails', () => {
  it('omits LICENSE file and package.json license fields until explicitly selected', () => {
    expect(existsSync(join(REPO_ROOT, 'LICENSE'))).toBe(false);
    expect(existsSync(join(REPO_ROOT, 'LICENSE.md'))).toBe(false);

    const pkgFiles = collectFiles(REPO_ROOT).filter((f) => f.endsWith('package.json'));
    expect(pkgFiles.length).toBeGreaterThanOrEqual(5);
    for (const pkgPath of pkgFiles) {
      const parsed = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
      expect(parsed.license, `${pkgPath} should not declare a license field`).toBeUndefined();
    }
  });

  it('never leaks internal repository names or private hostnames anywhere in the workspace', () => {
    const files = collectFiles(REPO_ROOT);
    for (const filePath of files) {
      const text = readFileSync(filePath, 'utf8').toLowerCase();
      const tokens = text.match(/[a-z0-9]+(?:[-.][a-z0-9]+)+/g) ?? [];
      for (const token of tokens) {
        const digest = createHash('sha256').update(token).digest('hex');
        expect(
          FORBIDDEN_TOKEN_SHA256.has(digest),
          `Forbidden internal token matched in ${filePath}`,
        ).toBe(false);
      }
    }
  });

  it('never uses TypeScript enum declarations in source files', () => {
    const tsFiles = collectFiles(join(REPO_ROOT, 'packages')).filter(
      (f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.includes('__tests__'),
    );
    for (const filePath of tsFiles) {
      const text = readFileSync(filePath, 'utf8');
      expect(text, `${filePath} must use const-object enums`).not.toMatch(/\benum\s+[A-Z]/);
    }
  });
});
