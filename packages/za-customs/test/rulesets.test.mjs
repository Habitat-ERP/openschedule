import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCustomsRulesetContainer,
  buildCustomsRuleset,
  calculateCustomsRulesetContainerId,
  calculateCustomsRulesetId,
  diffCustomsRulesets,
  findTariffLine,
  formatTariffLineBreadcrumb,
  formatTariffLineDisplayName,
  formatTariffLineLeafLabel,
  validateCustomsRuleset,
  validateCustomsRulesetContainer
} from "../dist/src/index.js";

const sourceDocumentSha256 = "0".repeat(64);
const generatedAt = "2026-07-04T00:00:00.000Z";
const sourceDocument = {
  schemaVersion: "core.source-document-metadata.v1",
  sha256: sourceDocumentSha256,
  fileName: "schedule.pdf",
  sourceUrl: "https://example.test/schedule.pdf",
  sourceIdentifier: "ZA_SARS_CUSTOMS_SCHEDULE_1_PART_1",
  sourceRole: "consolidated-schedule",
  publishedDate: "2026-05-29",
  retrievedAt: generatedAt
};

function sourceTrace(text = "synthetic source text") {
  return {
    schemaVersion: "core.source-trace.v1",
    sourceDocumentSha256,
    page: 28,
    locator: "synthetic fixture",
    text
  };
}

function rate(raw) {
  if (raw === "free") return { raw, kind: "free", components: [], warnings: [] };
  return { raw, kind: "ad_valorem", components: [{ basis: "customs_value", rate: Number(raw.replace("%", "")) / 100 }], warnings: [] };
}

function tariffLine(overrides = {}) {
  const tariffCode = overrides.tariffCode ?? "0307.39.10";
  const normalizedTariffCode = tariffCode.replace(/\D/g, "");
  return {
    schemaVersion: "za-customs.tariff-line.v1",
    tariffCode,
    normalizedTariffCode,
    checkDigit: overrides.checkDigit ?? "7",
    description: overrides.description ?? "- - - Smoked",
    normalizedDescription: overrides.normalizedDescription ?? "Smoked",
    statisticalUnit: "kg",
    rates: {
      general: rate(overrides.generalRate ?? "25%"),
      euUk: rate("free"),
      efta: rate("free"),
      sadc: rate("free"),
      mercosur: rate(overrides.mercosurRate ?? "25%"),
      afcfta: rate(overrides.afcftaRate ?? "10%")
    },
    validFrom: "2026-05-29",
    context: overrides.context ?? [
      {
        code: "03.07",
        normalizedCode: "0307",
        description: "Molluscs, whether in shell or not:",
        normalizedDescription: "Molluscs, whether in shell or not",
        level: 4,
        sourceTrace: [sourceTrace("03.07 Molluscs")]
      },
      {
        code: "0307.3",
        normalizedCode: "03073",
        description: "Mussels (Mytilus spp., Perna spp.):",
        normalizedDescription: "Mussels (Mytilus spp., Perna spp.)",
        level: 5,
        sourceTrace: [sourceTrace("0307.3 Mussels")]
      },
      {
        code: "0307.39",
        normalizedCode: "030739",
        description: "- - Other:",
        normalizedDescription: "Other",
        level: 6,
        sourceTrace: [sourceTrace("0307.39 Other")]
      }
    ],
    sourcePublishedDate: "2026-05-29",
    sourceImplementationDate: null,
    sourceTrace: [sourceTrace(`${tariffCode} ${overrides.normalizedDescription ?? "Smoked"}`)],
    parseConfidence: overrides.parseConfidence ?? 1,
    warnings: overrides.warnings ?? []
  };
}

function parseResult(lines) {
  return {
    schemaVersion: "za-customs.schedule1-parse-result.v1",
    tariffLines: lines,
    warnings: [],
    metrics: {
      pagesParsed: 1,
      textItems: 100,
      layoutRows: 10,
      candidateRows: lines.length,
      contextRows: 3,
      tariffLines: lines.length,
      rejectedRows: 0
    }
  };
}

function ruleset(lines) {
  return buildCustomsRuleset({
    parseResult: parseResult(lines),
    sourceDocuments: [sourceDocument],
    generatedAt,
    effectiveDate: "2026-05-29"
  });
}

test("builds deterministic rulesets, validates them, and looks up exact tariff codes", () => {
  const built = ruleset([tariffLine({ tariffCode: "0307.39.90", checkDigit: "8", normalizedDescription: "Other" }), tariffLine()]);
  const rebuilt = buildCustomsRuleset({
    parseResult: parseResult(built.tariffLines),
    sourceDocuments: [sourceDocument],
    generatedAt: "2026-07-05T00:00:00.000Z",
    effectiveDate: "2026-05-29"
  });

  assert.deepEqual(built.tariffLines.map((line) => line.normalizedTariffCode), ["03073910", "03073990"]);
  assert.match(built.manifest.rulesetId, /^ZA_SARS_CUSTOMS_SCHEDULE_1_PART_1_2026_05_29_[a-f0-9]{12}$/);
  assert.equal(rebuilt.manifest.rulesetId, built.manifest.rulesetId);
  assert.equal(calculateCustomsRulesetId(built), built.manifest.rulesetId);
  assert.equal(validateCustomsRuleset(built).valid, true);
  assert.equal(findTariffLine(built, "0307.39.10").normalizedTariffCode, "03073910");
  assert.equal(findTariffLine(built, "03073910").tariffCode, "0307.39.10");
});

test("source provenance changes ruleset IDs without local cache noise", () => {
  const built = ruleset([tariffLine()]);
  const localOnlyChange = buildCustomsRuleset({
    parseResult: parseResult(built.tariffLines),
    sourceDocuments: [{ ...sourceDocument, fileName: "local-copy.pdf", retrievedAt: "2026-07-05T00:00:00.000Z" }],
    generatedAt,
    effectiveDate: "2026-05-29"
  });
  const provenanceChange = buildCustomsRuleset({
    parseResult: parseResult(built.tariffLines),
    sourceDocuments: [{ ...sourceDocument, publishedDate: "2026-06-01" }],
    generatedAt,
    effectiveDate: "2026-05-29"
  });

  assert.equal(localOnlyChange.manifest.rulesetId, built.manifest.rulesetId);
  assert.notEqual(provenanceChange.manifest.rulesetId, built.manifest.rulesetId);
  assert.ok(diffCustomsRulesets(built, provenanceChange).changes.some((change) => change.category === "source_metadata_changed"));
});

test("builds deterministic all-schedules containers and validates source traces", () => {
  const built = ruleset([tariffLine()]);
  const container = buildCustomsRulesetContainer({
    manifest: { ...built.manifest, rulesetId: "ignored" },
    schedule1Part1: parseResult(built.tariffLines)
  });
  const localOnlyChange = buildCustomsRulesetContainer({
    manifest: {
      ...built.manifest,
      sourceDocuments: [{ ...sourceDocument, fileName: "local-copy.pdf", retrievedAt: "2026-07-05T00:00:00.000Z" }]
    },
    schedule1Part1: parseResult(built.tariffLines)
  });
  const parseChange = buildCustomsRulesetContainer({
    manifest: built.manifest,
    schedule1Part1: parseResult([{ ...built.tariffLines[0], description: "Changed goods" }])
  });
  const corrupted = structuredClone(container);
  corrupted.schedule1Part1.tariffLines[0].sourceTrace = [];

  assert.match(container.manifest.rulesetId, /^ZA_SARS_CUSTOMS_ALL_SCHEDULES_2026_05_29_[a-f0-9]{12}$/);
  assert.equal(localOnlyChange.manifest.rulesetId, container.manifest.rulesetId);
  assert.notEqual(parseChange.manifest.rulesetId, container.manifest.rulesetId);
  assert.equal(calculateCustomsRulesetContainerId(container), container.manifest.rulesetId);
  assert.equal(validateCustomsRulesetContainer(container).valid, true);
  assert.equal(validateCustomsRulesetContainer(corrupted).valid, false);
  assert.ok(validateCustomsRulesetContainer(corrupted).issues.some((issue) => issue.code === "source_trace_missing"));
});

test("derives consumer labels from the full hierarchy without storing them", () => {
  const line = tariffLine();

  assert.equal(formatTariffLineLeafLabel(line), "Smoked");
  assert.equal(
    formatTariffLineBreadcrumb(line),
    "Molluscs, whether in shell or not > Mussels (Mytilus spp., Perna spp.) > Other > Smoked"
  );
  assert.equal(
    formatTariffLineDisplayName(line),
    "0307.39.10 - Molluscs, whether in shell or not > Mussels (Mytilus spp., Perna spp.) > Other > Smoked"
  );
});

test("validation catches corrupted canonical fields", () => {
  const corrupted = structuredClone(ruleset([tariffLine()]));
  corrupted.parseMetrics.tariffLines = 2;
  corrupted.tariffLines[0].normalizedTariffCode = "03073911";
  corrupted.tariffLines[0].context[0].normalizedCode = "";
  corrupted.tariffLines[0].context[1].sourceTrace = [];
  corrupted.tariffLines[0].sourceTrace[0].sourceDocumentSha256 = "1".repeat(64);

  const report = validateCustomsRuleset(corrupted);
  const codes = report.issues.map((issue) => issue.code);

  assert.equal(report.valid, false);
  assert.ok(codes.includes("parse_metrics_mismatch"));
  assert.ok(codes.includes("code_normalization_mismatch"));
  assert.ok(codes.includes("context_code_normalization_mismatch"));
  assert.ok(codes.includes("source_trace_missing"));
  assert.ok(codes.includes("source_trace_unknown_document"));
  assert.ok(codes.includes("ruleset_id_mismatch"));
});

test("diffs rulesets with context-rich labels", () => {
  const before = ruleset([tariffLine(), tariffLine({ tariffCode: "0307.39.90", checkDigit: "8", normalizedDescription: "Other" })]);
  const after = ruleset([
    tariffLine({ description: "- - - Smoked, changed", normalizedDescription: "Smoked, changed", generalRate: "20%" }),
    tariffLine({ tariffCode: "0307.39.20", checkDigit: "2", normalizedDescription: "Prepared" })
  ]);

  const diff = diffCustomsRulesets(before, after);
  const categories = diff.changes.map((change) => change.category);

  assert.ok(categories.includes("line_added"));
  assert.ok(categories.includes("line_removed"));
  assert.ok(categories.includes("description_changed"));
  assert.ok(categories.includes("rate_raw_changed"));
  assert.ok(categories.includes("rate_components_changed"));
  assert.ok(diff.changes.some((change) => change.label?.includes("Molluscs")));
});
