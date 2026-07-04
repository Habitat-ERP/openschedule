# OpenSchedule by Habitat - Project Spec

## Status

Decision draft for the initial public repository. This document is the source of truth until implementation starts.

OpenSchedule should be built as open-source developer infrastructure for turning official statutory source documents into local, versioned, auditable rulesets. The first production slice is South African customs tariffs, starting with SARS Schedule 1 Part 1 ordinary customs duty.

## Core Position

OpenSchedule provides tooling. It does not become the authority.

Users fetch or provide official source documents in their own environment. OpenSchedule discovers, fetches, caches, parses, validates, diffs, and builds local rulesets from those documents. Generated rulesets remain in the user's environment.

OpenSchedule must not:

- redistribute SARS source documents;
- bundle SARS-derived datasets as package data;
- operate a hosted public SARS data or compliance API;
- claim automatic HS/tariff classification authority;
- become a Habitat-only SDK.

OpenSchedule should:

- expose clean TypeScript package APIs;
- expose hand-authored JSON Schemas;
- provide a CLI for local and CI use;
- provide a local-first MCP server for agents;
- preserve source provenance in every parsed record and calculation result;
- support optional private/self-hosted HTTP later, with OpenAPI only when HTTP exists.

## Public Repository Posture

Repository path:

```text
/Users/danielmarlin/dev-projects/openschedule
```

Target public repository name:

```text
openschedule
```

License:

```text
Apache-2.0
```

The Apache license applies to OpenSchedule code, schemas, parsers, CLI/MCP tooling, examples, and documentation. It does not apply to third-party official source documents fetched or processed by users, nor to generated datasets where the original publisher's terms apply.

Required notice:

> OpenSchedule does not redistribute official source documents or official datasets. Generated rulesets may be subject to the terms of the original source publisher. Users are responsible for verifying their use of source documents and generated outputs.

## Design Principles

### Developer Experience First

The primary API is package imports, not a hosted service.

Examples:

```ts
import {
  buildCustomsRuleset,
  estimateCustomsDuty,
  listRateOptions,
} from "@openschedule/za-customs";
```

Future modules should feel similarly direct:

```ts
import { PayeMonthly } from "@openschedule/za-paye";
```

### Local First

OpenSchedule works in local filesystems, CI jobs, and server-side Node.js projects. It should not require Habitat, Firestore, tenant concepts, or any hosted OpenSchedule service.

### Schema Led

Schemas are first-class contracts. The project should avoid Habitat's strong generation pipeline, but keep the discipline that schemas define what moves between tools.

Use hand-authored JSON Schema and hand-authored TypeScript types. Add generation only if drift becomes a real maintenance problem.

### Provenance By Default

Every source document is hashed. Every parsed record keeps source trace. Every calculation result identifies the ruleset and source records used.

### Few Dependencies

Core packages should stay small. Dependencies belong only where their value is clear:

- `@modelcontextprotocol/sdk` belongs only in `@openschedule/mcp`.
- PDF parsing belongs only in the SARS/customs package that needs it.
- OpenAPI tooling belongs only in a future HTTP server package, if added.

No dependency should exist just to make scaffolding look complete.

## Workspace Shape

Use npm workspaces from day one because packages are the developer API.

Initial package set:

```text
openschedule/
  packages/
    core/
    za-sars/
    za-customs/
    cli/
    mcp/

  docs/
  examples/
  SPEC.md
```

Do not create narrow packages such as `source-fetcher`, `parser-core`, `ruleset`, `validator`, or `audit` until separate publishing is genuinely useful.

## Package Responsibilities

### `@openschedule/core`

Pure shared primitives:

- source document metadata types;
- SHA-256 hashing helpers;
- date/effective-date helpers;
- ruleset manifest types;
- source trace types;
- diff result types/helpers;
- shared warning/error result shapes.

No SARS knowledge. No PDF parsing. No MCP SDK. No HTTP server.

### `@openschedule/za-sars`

SARS source discovery, fetching, and local source cache:

- knows official SARS source registry URLs;
- discovers registered SARS source documents;
- fetches official documents into user-selected local directories;
- hashes files and writes source metadata;
- never bundles SARS documents.

This package should understand SARS source pages and document references, but not customs duty business logic.

### `@openschedule/za-customs`

Customs parser, customs ruleset builder, and estimation helpers:

- parses SARS customs tariff source documents;
- starts with Schedule 1 Part 1 ordinary customs duty;
- emits versioned customs rulesets;
- exposes tariff-code lookup;
- estimates customs duty where mechanically resolvable;
- lists rate options for a tariff line;
- preserves raw rate text and parsed components;
- returns warnings for uncertainty instead of guessing.

This package depends on `core` and may depend on `za-sars`.

### `@openschedule/cli`

Human and CI interface over the package APIs:

```bash
npx @openschedule/cli discover za-sars customs
npx @openschedule/cli fetch za-sars customs --out ./sources
npx @openschedule/cli build za-customs --sources ./sources --out ./rulesets/za-customs.json
npx @openschedule/cli diff ./rulesets/old.json ./rulesets/new.json
npx @openschedule/cli estimate ./rulesets/za-customs.json --tariff-code 0207.12.90 --customs-value 100000
npx @openschedule/cli schemas za-customs
```

Data commands should emit JSON to stdout. Progress and diagnostics go to stderr.

### `@openschedule/mcp`

Local-first MCP server for AI assistants and agent workflows.

Initial transport:

```bash
npx @openschedule/mcp
```

Use stdio first. Add Streamable HTTP only when private deployments need it.

MCP tools should wrap the same library functions as the CLI:

- `discover_sources`
- `fetch_sources`
- `build_ruleset`
- `validate_ruleset`
- `diff_rulesets`
- `estimate_customs_duty`
- `list_rate_options`
- `explain_source_trace`

MCP resources:

- schemas;
- ruleset manifests;
- source metadata;
- validation reports;
- diffs.

Example resource URI shape:

```text
openschedule://schemas/za-customs/customs-ruleset.v1
openschedule://rulesets/{id}/manifest
openschedule://sources/{sha256}/metadata
```

MCP must not introduce a separate implementation path.

## API Surfaces

OpenSchedule has APIs, but not a hosted public API in V1.

### TypeScript Library API

Primary developer API.

```ts
import {
  discoverCustomsSources,
  fetchCustomsSources,
  buildCustomsRuleset,
  estimateCustomsDuty,
  listRateOptions,
} from "@openschedule/za-customs";
```

### Schema API

Export JSON Schemas and matching TypeScript types.

```ts
import {
  CustomsRulesetV1Schema,
  type CustomsRulesetV1,
} from "@openschedule/za-customs";
```

### CLI API

Scriptable local interface for developers and CI.

### MCP API

Agent interface for local assistant workflows.

### Optional HTTP API Later

Do not add `@openschedule/server` in the first scaffold. Add it only if users need a private local/self-hosted HTTP server.

Possible later package:

```text
packages/server/
  openapi/
    openschedule.v1.openapi.json
  src/
```

Possible HTTP surface:

```http
GET  /health
GET  /schemas
POST /za-customs/rulesets/build
POST /za-customs/duty/estimate
POST /rulesets/diff
```

OpenAPI describes HTTP only. It is not the source of truth for package APIs, CLI, MCP, or schemas.

## Schema Policy

Each package owns hand-authored JSON Schemas under `schemas/`.

Example:

```text
packages/za-customs/
  schemas/
    tariff-line.v1.schema.json
    customs-ruleset.v1.schema.json
    duty-estimate.v1.schema.json
  src/
    types.ts
    schemas.ts
```

Rules:

- every public JSON shape has a schema;
- every schema has `$id`, `title`, `description`, and `schemaVersion` where appropriate;
- schemas use stable names and semver-aware versions;
- schemas avoid generated-only artifacts;
- TypeScript types are hand-authored to match schemas;
- small tests check key schema/type invariants;
- add Ajv only when arbitrary runtime JSON validation becomes necessary.

MCP tools should use these same schemas for `inputSchema` and `outputSchema` wherever practical.

## Customs MVP Scope

Start with:

- SARS Schedule 1 Part 1, Chapters 1-99;
- ordinary customs duty;
- current consolidated PDF source;
- local source cache;
- source hashing;
- parser with source trace;
- customs ruleset builder;
- exact tariff-code lookup;
- basic duty estimate where resolvable;
- diff between locally built rulesets;
- schemas and examples.

Defer:

- Schedule 2 anti-dumping/countervailing/safeguard duties;
- rebate schedules;
- excise schedules;
- amendment notice application engine;
- automatic HS classification;
- automatic origin qualification;
- import VAT;
- customs FX;
- Habitat ERP integration.

## Current SARS Source Shape

The current SARS source shape, checked during planning:

- SARS tariff page links to the Tariff Book and explains that tariff classification drives duty rates.
- SARS schedules page lists Schedule 1 Part 1 as the current ordinary customs duty source.
- Schedule 1 Part 1 is currently published as a large PDF.
- Tariff amendment notices are published by year, generally as PDFs, with implementation/effective dates that may differ from publication dates.

Parser implementation must follow the actual current source documents. It must not assume convenient CSV/XLSX input unless SARS provides it for the selected source.

## Tariff Line Model

Every parsed tariff line should preserve raw official text and parsed structure.

Minimum fields:

```ts
interface TariffLineV1 {
  schemaVersion: "za-customs.tariff-line.v1";
  tariffCode: string;
  normalizedTariffCode: string;
  checkDigit?: string | null;
  description: string;
  statisticalUnit?: string | null;
  rates: {
    general: DutyRateV1;
    euUk?: DutyRateV1;
    efta?: DutyRateV1;
    sadc?: DutyRateV1;
    mercosur?: DutyRateV1;
    afcfta?: DutyRateV1;
  };
  validFrom: string;
  validTo?: string | null;
  sourcePublishedDate?: string | null;
  sourceImplementationDate?: string | null;
  sourceTrace: SourceTraceV1[];
  parseConfidence: number;
  warnings: string[];
}
```

Duty rate:

```ts
interface DutyRateV1 {
  raw: string;
  kind:
    | "free"
    | "ad_valorem"
    | "specific"
    | "compound"
    | "formula"
    | "unknown";
  components: DutyRateComponentV1[];
  warnings: string[];
}
```

Do not discard raw rate text. The raw text is part of auditability.

## Preferential Rates and Origin

V1 must model preferential columns without pretending to verify origin.

Calculation defaults to the `general` rate.

Preferential rates require an explicit claim:

```ts
estimateCustomsDuty({
  ruleset,
  tariffCode: "0207.12.90",
  customsValue: 100000,
  effectiveDate: "2026-07-04",
  preferenceClaim: {
    agreement: "sadc",
    originCountry: "BW",
    proof: {
      type: "certificate_of_origin",
      reference: "..."
    }
  }
});
```

If a preferential column is used, the result must warn:

```text
Preferential rate selected from SADC column; origin qualification and certificate validity were not verified.
```

Provide `listRateOptions()` so developers and agents can inspect available rate columns before estimating.

Keep schema space for later origin evaluation:

```ts
type OriginBasis =
  | "wholly_obtained"
  | "tariff_shift"
  | "value_added"
  | "specific_process"
  | "unknown";
```

Do not infer preferential eligibility from `originCountry` alone.

## Estimator Policy

The estimator is a deterministic helper, not a compliance guarantee.

It may calculate:

- `free`;
- simple ad valorem percentages;
- specific rates when quantity and unit are supplied;
- compound rates only when all required inputs are supplied and the rule is mechanically clear.

It must return warnings instead of guesses when:

- tariff code is absent;
- multiple effective records conflict;
- rate text is unknown or formula-like;
- quantity/unit is missing for a specific rate;
- preferential origin is claimed but not verifiable;
- parser confidence is low.

Calculation result minimum fields:

```ts
interface CustomsDutyEstimateV1 {
  schemaVersion: "za-customs.duty-estimate.v1";
  estimatedDuty: number | null;
  currency: "ZAR";
  rulesetId: string;
  tariffCode: string;
  rateColumn: string;
  effectiveDate: string;
  sourceTrace: SourceTraceV1[];
  warnings: string[];
}
```

## Ruleset Policy

A ruleset is immutable JSON output built from a specific set of source files.

Minimum manifest fields:

```ts
interface RulesetManifestV1 {
  schemaVersion: "core.ruleset-manifest.v1";
  rulesetId: string;
  domain: "za-customs";
  country: "ZA";
  publisher: "SARS";
  generatedAt: string;
  effectiveDate?: string | null;
  sourceDocuments: SourceDocumentMetadataV1[];
  parser: {
    packageName: string;
    packageVersion: string;
  };
  warnings: string[];
}
```

Ruleset IDs should be deterministic where practical and include jurisdiction/domain/date context, for example:

```text
ZA_SARS_CUSTOMS_SCHEDULE_1_PART_1_2026_05_29
```

## Diff Policy

Diffs compare ruleset JSON, not source PDFs directly.

Minimum diff categories:

- added tariff lines;
- removed tariff lines;
- changed descriptions;
- changed units;
- changed rate raw text;
- changed parsed rate components;
- changed source trace;
- changed warnings/confidence.

Diff output must be JSON and suitable for CI.

## CLI Commands

Initial command set:

```text
discover
fetch
build
diff
estimate
schemas
```

Keep command names predictable. Avoid hidden workflows.

Output rules:

- JSON to stdout for machine-readable results;
- logs/progress/errors to stderr;
- non-zero exit for failed operations;
- warnings included in JSON and mirrored to stderr where useful.

## MCP Policy

MCP is table stakes for AI-assisted workflows.

The MCP package should expose:

- tool schemas from the same JSON Schemas as the package APIs;
- resource URIs for schemas, manifests, source metadata, and diffs;
- safe write behavior limited to explicit output directories;
- no delete/cleanup/destructive tools in V1.

Tool annotations should mark reads/builds honestly. Fetch/build can write local files, so they are not read-only.

## OpenAPI Policy

OpenAPI is useful only when OpenSchedule has an HTTP API.

Do not add OpenAPI in V1 unless `@openschedule/server` is added.

When added:

- use OpenAPI for HTTP only;
- reference the canonical JSON Schemas;
- do not generate package types from OpenAPI;
- do not make OpenAPI the source of truth.

## Habitat Relationship

OpenSchedule is created by Habitat but must stay platform agnostic.

Habitat ERP can later consume rulesets through a separate integration package, for example:

```text
@habitat/openschedule-integration
```

That package can map OpenSchedule results into Habitat concepts such as item customs profiles and landed-cost worksheets. OpenSchedule itself must not import Habitat code or assume Habitat data models.

## Documentation Requirements

The README should open with developer workflow, not marketing.

Required early docs:

```text
docs/
  legal-posture.md
  source-document-workflow.md
  schemas.md
  customs-schedule-1-mvp.md
  mcp.md
  habitat-integration.md
```

Examples should be runnable and source-document neutral:

```text
examples/
  build-local-ruleset/
  estimate-customs-duty/
  diff-rulesets/
```

Do not include SARS source documents or copied SARS tariff rows in examples/tests. Use synthetic fixtures.

## Implementation Phases

### Phase 0 - Repo Docs

- Create public repo shell.
- Write this spec.
- Add README, license, notice, and gitignore.
- Do not scaffold implementation packages yet.

### Phase 1 - Workspace Contracts

- Add npm workspace.
- Add package shells.
- Add TypeScript config.
- Add initial schemas and types.
- Add minimal schema/type invariant tests.

### Phase 2 - Source Discovery and Cache

- Implement SARS source registry for Schedule 1 Part 1.
- Implement fetch to local directory.
- Implement SHA-256 hashing and source metadata files.

### Phase 3 - Schedule 1 Parser Spike

- Choose PDF parsing dependency only after testing it against current SARS Schedule 1 Part 1.
- Parse enough tariff lines to prove record shape, source trace, warnings, and confidence.
- Keep synthetic tests.

### Phase 4 - Ruleset Builder and Diff

- Build deterministic ruleset JSON.
- Implement ruleset validation helper.
- Implement diff JSON output.

### Phase 5 - Estimator

- Implement exact tariff-code lookup.
- Implement resolvable rate calculations.
- Add warnings for unresolved/ambiguous rates.

### Phase 6 - CLI

- Wrap source, build, diff, estimate, schemas.

### Phase 7 - MCP

- Wrap the same APIs as MCP tools/resources.

## Open Questions

- Which PDF parser handles the current SARS Schedule 1 PDF most reliably with the least dependency cost?
- Should package exports expose schemas from package root only, or also subpath exports such as `@openschedule/za-customs/schemas`?
- What is the minimum confidence threshold that should block builds versus emit warnings?
- Should ruleset IDs include source hash prefixes to distinguish same-date regenerated source corrections?
- When HTTP arrives, should it be `@openschedule/server` or a documented example server only?

