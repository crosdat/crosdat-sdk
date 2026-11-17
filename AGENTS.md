# crosdat-sdk - AI Agent Rules

Official SDK monorepo for integrating CROSDAT clinical APIs, UI embeds, React hooks, and Model Context Protocol (MCP) tools. Architecture and usage examples live in README.md. This file contains imperative rules only.

## Workspace boundaries

- Every file in this repository is public. Never commit internal hostnames, private infrastructure details, credentials, API keys, or proprietary clinical bundles.
- Keep this workspace completely self-contained. Never reference or import packages that are not published on the public npm registry or defined inside `packages/*`.
- Package names use the `@crosdat/*` scope (`@crosdat/sdk`, `@crosdat/embed`, `@crosdat/react`, `@crosdat/mcp`).
- Never import workspace packages via relative paths across package boundaries; always import by package name.
- `react` and `react-dom` are peer dependencies (`>=18.0.0`) on `@crosdat/react` only. Keep `@crosdat/sdk`, `@crosdat/embed`, and `@crosdat/mcp` framework-free.

## Enums and shared types

- Use `const X = { K: 'K' } as const; type X = (typeof X)[keyof typeof X];` for enums. Never use the TypeScript `enum` keyword.

## Documentation and tests

- Every exported class, function, hook, component, prop interface, and type must carry a complete JSDoc block (`@param`, `@returns`, and a plain-English description).
- Update the package `README.md` and root `README.md` in the same commit whenever exports or public behaviour change.
- Every addition or behaviour change requires unit test coverage in `src/__tests__/`.

## No session-shorthand or planning framing in artefacts

- Never write session-bound framing in code, comments, docs, commit messages, or tests (`phase`, `phases`, `milestone`, `milestones`, letter+digit shorthands, `Option A`, `in progress`, `step 1 of N`, `for now`, `temporary`, `_legacy`, or deprecation comments). When replacing a shape, delete the old shape in the same commit.

## Commits and tooling

- Node 24, pnpm 11.5.2, TypeScript 5.9.2.
- Format commit messages in imperative present tense without a parenthesised scope (`feat: ...`, `fix: ...`, `chore: ...`, `test: ...`, `docs: ...`, `refactor: ...`). Keep any commit body to one or two concise lines after a blank line; never include test/file counts or co-author trailers.
