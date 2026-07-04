# OpenSchedule Handoff

## Goal

Build OpenSchedule by Habitat from the spec in this repository.

Start by reading:

1. `SPEC.md`
2. `README.md`
3. `NOTICE`

The project is currently docs-only. No package scaffolding or implementation exists yet.

## Current Repo State

Path:

```text
/Users/danielmarlin/dev-projects/openschedule
```

Git:

```text
branch: main
commits: none yet
tracked files: none yet
```

Current files:

```text
.gitignore
HANDOFF.md
LICENSE
NOTICE
README.md
SPEC.md
```

## Locked Decisions

- Public open-source repo, Apache-2.0.
- npm workspaces from day one.
- Initial packages: `core`, `za-sars`, `za-customs`, `cli`, `mcp`.
- Package imports are the primary developer API.
- JSON Schemas are canonical data contracts.
- TypeScript types are hand-authored to match schemas.
- No Habitat dependency, Firestore assumption, tenant model, or ERP-specific code.
- No bundled SARS documents or SARS-derived datasets.
- Schedule 1 Part 1 ordinary customs duty is the MVP.
- Schedule 2, rebates, excise, amendment application engine, import VAT, customs FX, and Habitat integration are deferred.
- MCP is first-class but isolated in `@openschedule/mcp`.
- OpenAPI waits until/unless an HTTP server exists.
- CLI and MCP must wrap the same library functions.

## Build Discipline

Use ponytail mode:

- prefer the smallest working package boundary;
- use Node standard library first;
- add dependencies only when a real source format or protocol forces it;
- do not build speculative adapters, generators, or servers;
- write one small runnable check for non-trivial logic.

Expected initial dependency posture:

- root dev dependency: `typescript`;
- `@modelcontextprotocol/sdk` only in `packages/mcp`;
- no PDF dependency until the Schedule 1 parser spike proves which library works best.

## User Check-In Style

Before each material step, check in with the user in plain language:

1. what we are about to do;
2. why it is needed;
3. how small the change will be.

Keep updates clear and simple. Avoid long architecture essays unless the user asks.

Example:

```text
Next I’m adding the workspace and empty package shells. This is needed so package names and exports become real, but I’m not adding implementation or dependencies yet.
```

If a decision changes scope or adds a dependency, pause and explain the tradeoff before editing.

## Recommended Next Phase

Phase 1 from `SPEC.md`: Workspace Contracts.

Do this first:

1. Create root `package.json` with npm workspaces.
2. Create root `tsconfig.base.json`.
3. Create package shells for:
   - `packages/core`
   - `packages/za-sars`
   - `packages/za-customs`
   - `packages/cli`
   - `packages/mcp`
4. Add package `package.json` files with names, exports, scripts, and no unnecessary deps.
5. Add initial schema directories and placeholder-free first schemas only where contract is clear.
6. Add a tiny native `node:test` check for schema/type invariants if implementation begins.

Do not start PDF parsing yet.

## First Implementation Boundary

The first build should stop after package contracts compile.

Target command:

```bash
npm run typecheck
```

Avoid building parser behavior until the workspace, exports, and schemas are settled.

## Open Questions To Revisit

From `SPEC.md`:

- Which PDF parser handles current SARS Schedule 1 best with the least dependency cost?
- Should package exports expose schemas from root only, or also subpath exports such as `@openschedule/za-customs/schemas`?
- What confidence threshold should block builds versus emit warnings?
- Should ruleset IDs include source hash prefixes?
- Should future HTTP be `@openschedule/server` or an example-only server?

