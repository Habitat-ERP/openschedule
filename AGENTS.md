# OpenSchedule Agent Notes

OpenSchedule builds local, auditable statutory rulesets from official source documents. The current public surface is South African customs.

## Packages

- `@openschedule/core`: deterministic TypeScript contracts, JSON Schemas, source traces, validation reports, and ruleset diffs.
- `@openschedule/za-sars`: supported SARS customs source descriptors, status checks, and local fetch helpers.
- `@openschedule/za-customs`: consumer API for local-cache tariff lookup, rates, source trace, duties, reliefs, and mechanical duty estimates.
- `@openschedule/cli`: `openschedule customs ...` and source/status commands.
- `@openschedule/mcp`: stdio MCP server exposing source, schema, and ZA customs tools.

## Hard Rules

- Do not commit official SARS PDFs, fetched source caches, generated ZA customs cache artifacts, or shared SARS-derived data packages.
- Keep examples synthetic unless the user explicitly provides source data and asks to use it.
- Duty estimates are mechanical calculations from resolvable rates, not customs classification, brokerage, or legal advice.
- Prefer the public `@openschedule/za-customs` API for consumers. Use `@openschedule/za-customs/internal` only for parser, fixture, CLI, MCP, or maintenance work.

## Safe Consumer Path

```ts
import { createZaCustoms } from "@openschedule/za-customs";

const customs = await createZaCustoms({ sync: "if-stale" });
const estimate = customs.estimate({
  tariffCode: "000110",
  customsValue: 1000,
  effectiveDate: "2026-07-05"
});
```

For provenance, call `lookup(code, { includeMetadata: true })`, `source(code)`, or pass `includeMetadata: true` to rates, estimates, and measure listing methods.

## Deterministic Contracts

Published packages expose TypeScript declarations from `dist/src/*.d.ts`. Schema packages are exported under `@openschedule/core/schemas/*`, `@openschedule/za-sars/schemas/*`, and `@openschedule/za-customs/schemas/*`.

## MCP Registry Prep

`packages/mcp/package.json` declares `mcpName`, and `packages/mcp/server.json` contains matching MCP Registry metadata. The registry currently requires publishing the npm package first, then running `mcp-publisher login` and `mcp-publisher publish` from the server package directory. Do not publish externally without maintainer approval.

## Checks

```bash
npm test
git diff --check
npm --cache /tmp/openschedule-npm-cache pack --workspaces --dry-run --json > /tmp/openschedule-pack.json
```
