import assert from "node:assert/strict";
import test from "node:test";
import {
  RulesetManifestV1Schema,
  RulesetDiffV1Schema,
  ValidationReportV1Schema,
  SourceTraceV1Schema
} from "@openschedule/core";
import {
  CustomsDutyEstimateV1Schema,
  CustomsRulesetV1Schema,
  Schedule1ParseResultV1Schema,
  Schedule2ParseResultV1Schema,
  Schedule3ParseResultV1Schema,
  Schedule4ParseResultV1Schema,
  Schedule5ParseResultV1Schema,
  Schedule6ParseResultV1Schema,
  Schedule1QaReportV1Schema,
  ScheduleFamilyQaReportV1Schema,
  TariffLineV1Schema
} from "../dist/src/index.js";

test("schema versions are stable", () => {
  assert.equal(SourceTraceV1Schema.properties.schemaVersion.const, "core.source-trace.v1");
  assert.equal(RulesetManifestV1Schema.properties.schemaVersion.const, "core.ruleset-manifest.v1");
  assert.equal(RulesetDiffV1Schema.properties.schemaVersion.const, "core.ruleset-diff.v1");
  assert.equal(ValidationReportV1Schema.properties.schemaVersion.const, "core.validation-report.v1");
  assert.equal(TariffLineV1Schema.properties.schemaVersion.const, "za-customs.tariff-line.v1");
  assert.equal(CustomsRulesetV1Schema.properties.schemaVersion.const, "za-customs.customs-ruleset.v1");
  assert.equal(CustomsDutyEstimateV1Schema.properties.schemaVersion.const, "za-customs.duty-estimate.v1");
  assert.equal(Schedule1ParseResultV1Schema.properties.schemaVersion.const, "za-customs.schedule1-parse-result.v1");
  assert.equal(Schedule2ParseResultV1Schema.properties.schemaVersion.const, "za-customs.schedule2-parse-result.v1");
  assert.equal(Schedule3ParseResultV1Schema.properties.schemaVersion.const, "za-customs.schedule3-parse-result.v1");
  assert.equal(Schedule4ParseResultV1Schema.properties.schemaVersion.const, "za-customs.schedule4-parse-result.v1");
  assert.equal(Schedule5ParseResultV1Schema.properties.schemaVersion.const, "za-customs.schedule5-parse-result.v1");
  assert.equal(Schedule6ParseResultV1Schema.properties.schemaVersion.const, "za-customs.schedule6-parse-result.v1");
  assert.equal(Schedule1QaReportV1Schema.properties.schemaVersion.const, "za-customs.schedule1-qa-report.v1");
  assert.equal(ScheduleFamilyQaReportV1Schema.properties.schemaVersion.const, "za-customs.schedule-family-qa-report.v1");
});

test("tariff line contract keeps audit fields required", () => {
  assert.ok(TariffLineV1Schema.required.includes("sourceTrace"));
  assert.ok(TariffLineV1Schema.required.includes("parseConfidence"));
  assert.ok(TariffLineV1Schema.properties.rates.required.includes("general"));
  assert.ok(TariffLineV1Schema.properties.rates.properties.general.$ref);
});

test("customs ruleset contract keeps parser metrics", () => {
  assert.ok(CustomsRulesetV1Schema.required.includes("parseMetrics"));
  assert.ok(CustomsRulesetV1Schema.properties.parseMetrics.required.includes("tariffLines"));
  assert.ok(CustomsRulesetV1Schema.properties.pageMetrics);
  assert.ok(Schedule1ParseResultV1Schema.properties.pageMetrics);
  assert.ok(Schedule2ParseResultV1Schema.properties.metrics.$ref);
  assert.ok(Schedule3ParseResultV1Schema.properties.metrics.$ref);
  assert.ok(Schedule4ParseResultV1Schema.properties.metrics.$ref);
  assert.ok(Schedule5ParseResultV1Schema.properties.metrics.$ref);
  assert.ok(Schedule6ParseResultV1Schema.properties.metrics.$ref);
  assert.ok(Schedule1QaReportV1Schema.required.includes("summary"));
  assert.ok(ScheduleFamilyQaReportV1Schema.required.includes("summary"));
});
