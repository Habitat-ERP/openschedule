import type { RulesetManifestV1, SourceTraceV1 } from "@openschedule/core";
import type { CustomsDutyEstimateV1, CustomsRulesetV1, TariffLineV1 } from "../src/index.js";

const sourceTrace = {
  schemaVersion: "core.source-trace.v1",
  sourceDocumentSha256: "0".repeat(64),
  page: 1,
  locator: "synthetic fixture",
  text: "synthetic source text"
} satisfies SourceTraceV1;

const manifest = {
  schemaVersion: "core.ruleset-manifest.v1",
  rulesetId: "ZA_SARS_CUSTOMS_SCHEDULE_1_PART_1_SYNTHETIC",
  domain: "za-customs",
  country: "ZA",
  publisher: "SARS",
  generatedAt: "2026-07-04T00:00:00.000Z",
  sourceDocuments: [
    {
      schemaVersion: "core.source-document-metadata.v1",
      sha256: "0".repeat(64),
      fileName: "synthetic-source"
    }
  ],
  parser: {
    packageName: "@openschedule/za-customs",
    packageVersion: "0.0.0"
  },
  warnings: []
} satisfies RulesetManifestV1;

const tariffLine = {
  schemaVersion: "za-customs.tariff-line.v1",
  tariffCode: "0000.00.00",
  normalizedTariffCode: "00000000",
  description: "Synthetic goods",
  normalizedDescription: "Synthetic goods",
  rates: {
    general: {
      raw: "free",
      kind: "free",
      components: [],
      warnings: []
    }
  },
  validFrom: "2026-07-04",
  sourceTrace: [sourceTrace],
  parseConfidence: 1,
  warnings: []
} satisfies TariffLineV1;

const ruleset = {
  schemaVersion: "za-customs.customs-ruleset.v1",
  manifest,
  tariffLines: [tariffLine]
} satisfies CustomsRulesetV1;

const estimate = {
  schemaVersion: "za-customs.duty-estimate.v1",
  estimatedDuty: 0,
  currency: "ZAR",
  rulesetId: ruleset.manifest.rulesetId,
  tariffCode: tariffLine.tariffCode,
  rateColumn: "general",
  effectiveDate: "2026-07-04",
  sourceTrace: [sourceTrace],
  warnings: []
} satisfies CustomsDutyEstimateV1;

void estimate;
