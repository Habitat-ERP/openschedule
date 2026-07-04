# OpenSchedule Customs Data Roadmap

## Position

OpenSchedule is customs data infrastructure. It should produce trusted, local, versioned, auditable rulesets from official SARS source documents.

It should not become:

- an automatic HS/tariff classification authority;
- a hosted public SARS data API;
- a product-search or ranking engine;
- a broker workflow system;
- a Habitat-specific SDK.

Downstream applications can index rulesets in Typesense, Postgres, Elasticsearch, embeddings, or another search layer. OpenSchedule should make the data correct, traceable, and easy to consume.

## Mandatory Phase Gate

Every implementation phase below must start with a short planning pass before code is changed.

1. **Sub-agent research pass**
   - One agent checks SARS/source/document reality.
   - One agent checks codebase fit and minimal API shape.
   - One agent checks QA risks and test strategy when the phase affects parsing, dates, or ruleset output.

2. **Philosophy adherence pass**
   - Confirm the work is data infrastructure, not classification/search/product workflow.
   - Confirm package APIs remain primary.
   - Confirm schemas remain canonical contracts.
   - Confirm no source PDFs or SARS-derived datasets are committed.
   - Confirm no new dependency unless the source format or protocol forces it.

3. **Quality pass**
   - Define schema/type changes first.
   - Define synthetic fixtures.
   - Define optional live SARS smoke checks separately from default tests.
   - Define what is warning/manual-review versus build-blocking.

Only after this gate should code be refactored or built.

## Phase 8 - Parser QA Hardening

Status: implemented in the current working tree.

Purpose:

- prove the Schedule 1 Part 1 parser is inspectable;
- surface uncertainty instead of hiding it;
- create QA reports and tricky-case review sets.

Acceptance:

- parser QA schema/type/API exists;
- CLI/MCP expose QA where appropriate;
- default tests pass;
- optional live full-PDF checks remain local and uncommitted.

## Phase 9 - SARS Customs Source Registry

Purpose:

- inventory the full relevant SARS customs/tariff source set;
- add source descriptors without parsing or applying anything new yet.

Scope:

- Schedule 1 document families;
- Schedule 2 anti-dumping/countervailing/safeguard sources;
- rebate schedule sources;
- excise/ad valorem sources where relevant;
- amendment notice registries/pages.

Deliverables:

- expanded `za-sars` source descriptor contracts;
- source discovery grouped by schedule/family;
- tests with synthetic source descriptors;
- docs explaining source coverage and exclusions.

Skip:

- parsers for new document families;
- amendment application;
- search/classification.

## Phase 10 - Source Status And Update Detection

Purpose:

- tell users whether official SARS sources have changed since their local cache/ruleset was built.

Scope:

- compare source descriptors, retrieved metadata, content hashes, published dates, and URLs;
- distinguish unchanged, changed, missing, and failed checks;
- keep all fetched data local.

Deliverables:

- `checkCustomsSources()` style package API;
- CLI/MCP wrappers;
- structured status schema;
- tests with injected fetch responses.

Skip:

- applying updates;
- recursively scraping beyond declared sources;
- treating `HEAD` as reliable when SARS blocks it.

## Phase 11 - Consolidated Schedule Coverage By Document Family

Purpose:

- extend parsing beyond Schedule 1 Part 1 only where the consolidated source layout is understood.
- cover all registered consolidated SARS schedule PDFs over successive family slices.

Scope:

- target all current consolidated schedule PDFs declared in `SARS_CUSTOMS_SOURCES`;
- add one document family at a time;
- keep distinct legal objects distinct: ordinary tariff lines, trade remedy lines, rebate/drawback/refund lines, excise/levy lines, and notes;
- keep family-specific parsers only when layouts truly differ;
- preserve source trace, parse confidence, QA reports, and ruleset manifests.

Suggested implementation order:

- Schedule 2 trade remedies;
- Schedule 3 industrial rebates;
- Schedule 4 general rebates;
- Schedule 5 drawbacks/refunds;
- Schedule 6 excise/fuel/environmental rebates/refunds;
- Schedule 1 excise/levy parts;
- Schedule 1 general notes and other note-only documents.

Deliverables per family:

- schema/type additions when the data shape differs;
- parser and QA report;
- synthetic fixtures;
- optional live smoke checks;
- candidate lookup helpers after parser shape is stable;
- diff behavior for the family output.

Skip:

- amendment notices;
- landed-cost calculations;
- a combined all-schedules ruleset until Phase 12;
- trying to normalize every customs concept into one premature abstraction.

## Phase 12 - Ruleset Version And Provenance Model

Purpose:

- support rulesets built from multiple source documents and prepared for historical timelines.

Scope:

- strengthen manifest/source provenance;
- model source document roles, effective dates, published dates, and supersession links;
- keep generated rulesets immutable.

Deliverables:

- manifest/schema changes;
- combined all-schedules ruleset/container once Phase 11 family parsers exist;
- deterministic ruleset IDs for multi-source builds;
- validation for source trace coverage;
- diff output that explains source-document changes clearly.

Skip:

- amendment instruction parsing;
- timeline orchestration.

## Phase 13 - Amendment Notice Discovery And Metadata

Purpose:

- discover, fetch, hash, and describe SARS amendment notices without applying them yet.

Scope:

- notice number;
- notice title;
- publication date;
- implementation/effective date when present;
- affected schedule/part/chapter/code hints;
- source trace to notice text.

Deliverables:

- amendment notice source descriptors;
- fetched-notice metadata schema;
- CLI/MCP wrappers;
- tests with synthetic notice PDFs/text fixtures.

Skip:

- changing tariff lines;
- guessing affected codes when notice text is ambiguous.

## Phase 14 - Amendment Operation Extraction

Purpose:

- parse amendment notice text into explicit structured operations.

Operation kinds:

- insert;
- delete;
- substitute;
- rate change;
- wording change;
- effective date change;
- manual review required.

Deliverables:

- amendment operation schema;
- parser for notice instructions;
- source trace per operation;
- confidence/warnings per operation;
- QA report for unresolved/manual operations.

Skip:

- applying operations to rulesets until extraction quality is proven.

## Phase 15 - Amendment Application Engine

Purpose:

- apply trusted amendment operations to a base ruleset and emit a new immutable ruleset.

Scope:

- apply only mechanically clear operations;
- set `validFrom` and `validTo`;
- preserve provenance from base consolidated source and amendment notice;
- fail or warn on ambiguous operations.

Deliverables:

- `applyCustomsAmendments()` style API;
- validation and diff coverage;
- synthetic amendment fixtures;
- optional live notice smoke tests;
- explicit manual-review output.

Skip:

- legal interpretation beyond mechanically clear notice instructions.

## Phase 16 - Ruleset Timeline And Update Workflow

Purpose:

- help users maintain a local sequence of rulesets over time.

Scope:

- build current ruleset;
- detect changed sources;
- ingest notices;
- apply clear amendments;
- produce timeline/diff reports by effective date.

Deliverables:

- local update workflow APIs;
- CLI/MCP wrappers;
- timeline schema;
- CI-friendly JSON reports.

Skip:

- hosted scheduling;
- background daemons;
- destructive cleanup commands.

## Phase 17 - Consumer Documentation And Release Hardening

Purpose:

- make the data pipeline usable by external developers.

Scope:

- package API examples;
- CLI examples;
- MCP examples;
- source/legal caveats;
- ruleset lifecycle guidance;
- parser QA interpretation.

Deliverables:

- README update;
- examples using synthetic fixtures;
- release checklist;
- package export audit.

Skip:

- examples that bundle SARS rows, PDFs, or derived datasets.

## Non-Goals Until Explicitly Reopened

- automatic HS/tariff classification;
- product search/ranking;
- origin qualification automation;
- import VAT;
- customs FX;
- landed-cost workflows;
- hosted public API;
- Habitat ERP integration.
