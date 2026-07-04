import type { RulesetManifestV1, SourceTraceV1 } from "@openschedule/core";
import type {
  CustomsDutyEstimateV1,
  CustomsRulesetV1,
  Schedule1QaReportV1,
  Schedule2ParseResultV1,
  TariffLineV1
} from "../src/index.js";

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
  parseMetrics: {
    pagesParsed: 1,
    textItems: 1,
    layoutRows: 1,
    candidateRows: 1,
    contextRows: 0,
    tariffLines: 1,
    rejectedRows: 0
  },
  pageMetrics: [
    {
      pageNumber: 1,
      textItems: 1,
      layoutRows: 1,
      candidateRows: 1,
      contextRows: 0,
      tariffLines: 1,
      rejectedRows: 0
    }
  ],
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

const qaReport = {
  schemaVersion: "za-customs.schedule1-qa-report.v1",
  summary: {
    tariffLines: 1,
    linesWithoutContext: 0,
    contextPrefixMismatches: 0,
    suspiciousContextJumps: 0,
    lowConfidenceLines: 0,
    unknownOrFormulaRateLines: 0,
    continuationRows: 0,
    duplicateNormalizedCodes: 0,
    pagesWithHighRejectionCounts: 0
  },
  issues: [],
  reviewSet: [],
  warnings: []
} satisfies Schedule1QaReportV1;

const schedule2ParseResult = {
  schemaVersion: "za-customs.schedule2-parse-result.v1",
  tradeRemedyLines: [
    {
      schemaVersion: "za-customs.schedule2-trade-remedy-line.v1",
      item: "201.02",
      normalizedItem: "20102",
      tariffHeading: "0207.14.9",
      normalizedTariffHeading: "0207149",
      code: "03.07",
      normalizedCode: "0307",
      checkDigit: "70",
      description: "Synthetic trade remedy goods",
      normalizedDescription: "Synthetic trade remedy goods",
      rebateItems: ["301.00-399.00"],
      originatingCountryOrTerritory: "Germany",
      rate: {
        raw: "73,33%",
        kind: "ad_valorem",
        components: [{ basis: "customs_value", rate: 0.7333 }],
        warnings: []
      },
      validFrom: "2026-06-12",
      sourceTrace: [sourceTrace],
      parseConfidence: 1,
      warnings: []
    }
  ],
  warnings: [],
  metrics: {
    pagesParsed: 1,
    textItems: 1,
    layoutRows: 1,
    candidateRows: 1,
    contextRows: 0,
    tradeRemedyLines: 1,
    rejectedRows: 0
  }
} satisfies Schedule2ParseResultV1;

void estimate;
void qaReport;
void schedule2ParseResult;
