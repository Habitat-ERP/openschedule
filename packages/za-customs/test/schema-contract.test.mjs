import assert from "node:assert/strict";
import test from "node:test";
import {
  RulesetManifestV1Schema,
  SourceTraceV1Schema
} from "@openschedule/core";
import {
  CustomsDutyEstimateV1Schema,
  CustomsRulesetV1Schema,
  Schedule1ParseResultV1Schema,
  TariffLineV1Schema
} from "../dist/src/index.js";

test("schema versions are stable", () => {
  assert.equal(SourceTraceV1Schema.properties.schemaVersion.const, "core.source-trace.v1");
  assert.equal(RulesetManifestV1Schema.properties.schemaVersion.const, "core.ruleset-manifest.v1");
  assert.equal(TariffLineV1Schema.properties.schemaVersion.const, "za-customs.tariff-line.v1");
  assert.equal(CustomsRulesetV1Schema.properties.schemaVersion.const, "za-customs.customs-ruleset.v1");
  assert.equal(CustomsDutyEstimateV1Schema.properties.schemaVersion.const, "za-customs.duty-estimate.v1");
  assert.equal(Schedule1ParseResultV1Schema.properties.schemaVersion.const, "za-customs.schedule1-parse-result.v1");
});

test("tariff line contract keeps audit fields required", () => {
  assert.ok(TariffLineV1Schema.required.includes("sourceTrace"));
  assert.ok(TariffLineV1Schema.required.includes("parseConfidence"));
  assert.ok(TariffLineV1Schema.properties.rates.required.includes("general"));
  assert.ok(TariffLineV1Schema.properties.rates.properties.general.$ref);
});
