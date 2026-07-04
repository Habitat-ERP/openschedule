import type { RulesetManifestV1, SourceTraceV1 } from "@openschedule/core";
import type {
  CustomsDutyEstimateV1,
  CustomsRulesetContainerV1,
  CustomsRulesetV1,
  ScheduleFamilyQaReportV1,
  Schedule1ExciseLeviesParseResultV1,
  Schedule1ParseResultV1,
  Schedule1QaReportV1,
  Schedule2ParseResultV1,
  Schedule3ParseResultV1,
  Schedule4ParseResultV1,
  Schedule5ParseResultV1,
  Schedule6ParseResultV1,
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
      fileName: "synthetic-source",
      sourceIdentifier: "ZA_SARS_CUSTOMS_SCHEDULE_1_PART_1",
      sourceRole: "consolidated-schedule",
      publishedDate: "2026-07-04",
      effectiveDate: "2026-07-04",
      supersedes: ["ZA_SARS_CUSTOMS_SCHEDULE_1_PART_1_OLD"],
      supersededBy: []
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

const schedule1ParseResult = {
  schemaVersion: "za-customs.schedule1-parse-result.v1",
  tariffLines: [tariffLine],
  warnings: [],
  metrics: ruleset.parseMetrics,
  pageMetrics: ruleset.pageMetrics
} satisfies Schedule1ParseResultV1;

const rulesetContainer = {
  schemaVersion: "za-customs.customs-ruleset-container.v1",
  manifest,
  schedule1Part1: schedule1ParseResult
} satisfies CustomsRulesetContainerV1;

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

const scheduleFamilyQaReport = {
  schemaVersion: "za-customs.schedule-family-qa-report.v1",
  schedule: "schedule2",
  summary: {
    lines: 1,
    lowConfidenceLines: 0,
    continuationRows: 0,
    duplicateNormalizedFamilyKeys: 0,
    linesMissingSourceTrace: 0,
    missingRequiredFields: 0,
    pagesWithHighRejectionCounts: 0
  },
  issues: [],
  warnings: []
} satisfies ScheduleFamilyQaReportV1;

const schedule1ExciseLeviesParseResult = {
  schemaVersion: "za-customs.schedule1-excise-levies-parse-result.v1",
  exciseLevyLines: [
    {
      schemaVersion: "za-customs.schedule1-excise-levy-line.v1",
      part: "2A",
      item: "104.10.10",
      normalizedItem: "1041010",
      tariffSubheading: "2203.00.05",
      normalizedTariffSubheading: "22030005",
      description: "Synthetic excise goods",
      normalizedDescription: "Synthetic excise goods",
      rate: {
        raw: "7,82c/li",
        kind: "specific",
        components: [{ amount: 7.82, currency: "ZAc", perQuantity: 1, unit: "li" }],
        warnings: []
      },
      validFrom: "2026-04-30",
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
    exciseLevyLines: 1,
    rejectedRows: 0
  }
} satisfies Schedule1ExciseLeviesParseResultV1;

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

const schedule3ParseResult = {
  schemaVersion: "za-customs.schedule3-parse-result.v1",
  rebateLines: [
    {
      schemaVersion: "za-customs.schedule3-industrial-rebate-line.v1",
      part: "1",
      rebateItem: "303.01",
      normalizedRebateItem: "30301",
      tariffHeading: "1511.90",
      normalizedTariffHeading: "151190",
      rebateCode: "01.06",
      normalizedRebateCode: "0106",
      checkDigit: "62",
      description: "Synthetic industrial rebate goods",
      normalizedDescription: "Synthetic industrial rebate goods",
      extentOfRebate: "Full duty",
      validFrom: "2026-01-25",
      context: [
        {
          part: "1",
          rebateItem: "303.00",
          normalizedRebateItem: "30300",
          description: "Synthetic industry",
          normalizedDescription: "Synthetic industry",
          level: 1,
          sourceTrace: [sourceTrace]
        }
      ],
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
    contextRows: 1,
    rebateLines: 1,
    rejectedRows: 0
  }
} satisfies Schedule3ParseResultV1;

const schedule4ParseResult = {
  schemaVersion: "za-customs.schedule4-parse-result.v1",
  rebateLines: [
    {
      schemaVersion: "za-customs.schedule4-rebate-line.v1",
      part: "2",
      rebateItem: "460.01",
      normalizedRebateItem: "46001",
      tariffHeading: "03.02",
      normalizedTariffHeading: "0302",
      rebateCode: "01.04",
      normalizedRebateCode: "0104",
      checkDigit: "49",
      description: "Synthetic Schedule 4 rebate goods",
      normalizedDescription: "Synthetic Schedule 4 rebate goods",
      extentOfRebate: "Full duty",
      validFrom: "2026-06-12",
      context: [
        {
          part: "2",
          rebateItem: "460.00",
          normalizedRebateItem: "46000",
          description: "Synthetic Schedule 4 context",
          normalizedDescription: "Synthetic Schedule 4 context",
          level: 1,
          sourceTrace: [sourceTrace]
        }
      ],
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
    contextRows: 1,
    rebateLines: 1,
    rejectedRows: 0
  }
} satisfies Schedule4ParseResultV1;

const schedule5ParseResult = {
  schemaVersion: "za-customs.schedule5-parse-result.v1",
  drawbackRefundLines: [
    {
      schemaVersion: "za-customs.schedule5-drawback-refund-line.v1",
      part: "1",
      item: "501.02",
      normalizedItem: "50102",
      tariffHeading: "03.05",
      normalizedTariffHeading: "0305",
      code: "01.04",
      normalizedCode: "0104",
      checkDigit: "43",
      description: "Synthetic Schedule 5 drawback goods",
      normalizedDescription: "Synthetic Schedule 5 drawback goods",
      extentOfRefundOrDrawback: "Full duty",
      validFrom: "2026-01-01",
      context: [
        {
          part: "1",
          item: "501.00",
          normalizedItem: "50100",
          description: "Synthetic Schedule 5 context",
          normalizedDescription: "Synthetic Schedule 5 context",
          level: 1,
          sourceTrace: [sourceTrace]
        }
      ],
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
    contextRows: 1,
    drawbackRefundLines: 1,
    rejectedRows: 0
  }
} satisfies Schedule5ParseResultV1;

const schedule6ParseResult = {
  schemaVersion: "za-customs.schedule6-parse-result.v1",
  exciseRebateRefundLines: [
    {
      schemaVersion: "za-customs.schedule6-excise-rebate-refund-line.v1",
      part: "1B",
      item: "619.01",
      normalizedItem: "61901",
      tariffItem: "104.10.10",
      normalizedTariffItem: "1041010",
      rebateCode: "01.01",
      normalizedRebateCode: "0101",
      checkDigit: "76",
      description: "Synthetic Schedule 6 excise goods",
      normalizedDescription: "Synthetic Schedule 6 excise goods",
      extentOfRebate: "Full duty",
      extentOfRefund: "",
      validFrom: "2026-07-01",
      context: [
        {
          part: "1B",
          item: "619.00",
          normalizedItem: "61900",
          description: "Synthetic Schedule 6 context",
          normalizedDescription: "Synthetic Schedule 6 context",
          level: 1,
          sourceTrace: [sourceTrace]
        }
      ],
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
    contextRows: 1,
    exciseRebateRefundLines: 1,
    rejectedRows: 0
  }
} satisfies Schedule6ParseResultV1;

void estimate;
void rulesetContainer;
void qaReport;
void scheduleFamilyQaReport;
void schedule1ExciseLeviesParseResult;
void schedule2ParseResult;
void schedule3ParseResult;
void schedule4ParseResult;
void schedule5ParseResult;
void schedule6ParseResult;
