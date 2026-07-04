# OpenSchedule Handoff

## Goal

Build OpenSchedule by Habitat from `SPEC.md`, `README.md`, and `NOTICE`.

OpenSchedule is now an npm workspace with source fetching, customs parsing, ruleset building, estimation, CLI wrappers, and MCP wrappers implemented for the South African SARS Schedule 1 Part 1 MVP.

## Current Repo State

Path:

```text
/Users/danielmarlin/dev-projects/openschedule
```

Branch:

```text
main
```

Recent commits:

```text
0985162 Add CLI wrappers
9874ee9 Add customs duty estimator
5e6a350 Add customs ruleset builder
53f1dd3 Add Schedule 1 parser spike
ea5402b Scaffold workspace and SARS source cache
```

Generated inspection artifacts are local and ignored:

```text
tmp/za-customs-schedule1-parse-result.full.json
tmp/za-customs-customs-ruleset.full.json
```

## Packages

- `@openschedule/core`: source document metadata, source traces, ruleset manifests, validation/diff contracts, schemas.
- `@openschedule/za-sars`: curated SARS customs source discovery and fetch/cache.
- `@openschedule/za-customs`: PDF text extraction, Schedule 1 parser, customs rulesets, validation, diff, lookup, rate options, estimator, schemas.
- `@openschedule/cli`: executable wrappers for discover, fetch, build, diff, lookup, rates, estimate, schemas.
- `@openschedule/mcp`: stdio MCP wrappers for the same package APIs and schema resources.

## Locked Decisions

- Public open-source repo, Apache-2.0.
- npm workspaces.
- Package imports are the primary developer API.
- JSON Schemas are canonical data contracts.
- TypeScript types are hand-authored to match schemas.
- No Habitat dependency, Firestore assumption, tenant model, or ERP-specific code.
- No bundled SARS documents or SARS-derived datasets.
- Schedule 1 Part 1 ordinary customs duty is the MVP.
- Schedule 2, rebates, excise, amendment application engine, import VAT, customs FX, and Habitat integration remain deferred.
- CLI and MCP wrap package APIs; they do not reimplement parser, ruleset, or estimator logic.
- OpenAPI waits until/unless an HTTP server exists.

## Build Discipline

Use ponytail mode:

- prefer the smallest working package boundary;
- use Node standard library first;
- add dependencies only when a real source format or protocol forces it;
- do not build speculative adapters, generators, parsers, or servers;
- write one small runnable check for non-trivial logic.

Current dependency posture:

- root dev dependencies: TypeScript and Node types;
- `pdfjs-dist` only in `@openschedule/za-customs`;
- no MCP SDK dependency; `@openschedule/mcp` is a small stdio JSON-RPC wrapper.

## Verification

Default verification:

```bash
npm test
```

Current expected result:

```text
27 passed, 1 optional live parser smoke test skipped
```

Optional live parser smoke:

```bash
OPENSCHEDULE_SARS_PDF_PATH=/tmp/openschedule-live-sources/ZA_SARS_CUSTOMS_SCHEDULE_1_PART_1_2026-05-29_b89ce3eefb3d.pdf npm test
```

Useful CLI checks:

```bash
node_modules/.bin/openschedule discover za-sars customs
node_modules/.bin/openschedule rates tmp/za-customs-customs-ruleset.full.json --tariff-code 0307.39.10
node_modules/.bin/openschedule estimate tmp/za-customs-customs-ruleset.full.json --tariff-code 0307.39.10 --effective-date 2026-07-04 --customs-value 100000
```

Useful MCP smoke:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | node_modules/.bin/openschedule-mcp
```

## User Check-In Style

Before each material step, check in with the user in plain language:

1. what we are about to do;
2. why it is needed;
3. how small the change will be.

If a decision changes scope or adds a dependency, pause and explain the tradeoff before editing.

## Recommended Next Phase

Next likely phase: polish and hardening before broadening scope.

Good candidates:

1. Add an optional full live build smoke for CLI/MCP behind `OPENSCHEDULE_SARS_PDF_PATH`.
2. Improve parser QA reports around rejected rows and low-confidence lines.
3. Add README usage examples for the package API, CLI, and MCP.
4. Decide whether Phase 8 should be docs/release packaging or deeper parser QA.

Do not start Schedule 2, rebates, amendment application, VAT, FX, OpenAPI, or Habitat integration until explicitly requested.

## Open Questions To Revisit

- What confidence threshold should block builds versus emit warnings?
- Should future HTTP be `@openschedule/server` or an example-only server?
- How much parser QA evidence is enough before treating the SARS parser as production-ready?
