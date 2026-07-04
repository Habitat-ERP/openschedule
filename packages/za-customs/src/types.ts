import type { RulesetManifestV1, SourceTraceV1 } from "@openschedule/core";

export const CUSTOMS_RATE_COLUMNS = ["general", "euUk", "efta", "sadc", "mercosur", "afcfta"] as const;

export type DutyRateKindV1 =
  | "free"
  | "ad_valorem"
  | "specific"
  | "compound"
  | "formula"
  | "unknown";

export interface DutyRateComponentV1 {
  [key: string]: unknown;
}

export interface DutyRateV1 {
  raw: string;
  kind: DutyRateKindV1;
  components: DutyRateComponentV1[];
  warnings: string[];
}

export interface TariffLineContextV1 {
  code: string;
  normalizedCode: string;
  description: string;
  normalizedDescription: string;
  level: number;
  sourceTrace: SourceTraceV1[];
}

export interface TariffLineV1 {
  schemaVersion: "za-customs.tariff-line.v1";
  tariffCode: string;
  normalizedTariffCode: string;
  checkDigit?: string | null;
  description: string;
  normalizedDescription: string;
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
  context?: TariffLineContextV1[];
  sourcePublishedDate?: string | null;
  sourceImplementationDate?: string | null;
  sourceTrace: SourceTraceV1[];
  parseConfidence: number;
  warnings: string[];
}

export interface CustomsRulesetV1 {
  schemaVersion: "za-customs.customs-ruleset.v1";
  manifest: RulesetManifestV1;
  parseMetrics: Schedule1ParseMetricsV1;
  pageMetrics?: Schedule1ParsePageMetricsV1[];
  tariffLines: TariffLineV1[];
}

export interface CustomsDutyEstimateV1 {
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

export type CustomsRateColumnV1 = (typeof CUSTOMS_RATE_COLUMNS)[number];

export interface CustomsRateOptionV1 {
  column: CustomsRateColumnV1;
  raw: string;
  kind: DutyRateKindV1;
  warnings: string[];
  sourceTrace: SourceTraceV1[];
}

export interface CustomsPreferenceClaimV1 {
  agreement: Exclude<CustomsRateColumnV1, "general">;
  originCountry?: string | null;
  proof?: Record<string, unknown> | null;
}

export interface EstimateCustomsDutyOptionsV1 {
  ruleset: CustomsRulesetV1;
  tariffCode: string;
  customsValue?: number | null;
  quantity?: number | null;
  quantityUnit?: string | null;
  effectiveDate: string;
  rateColumn?: CustomsRateColumnV1;
  preferenceClaim?: CustomsPreferenceClaimV1 | null;
}

export interface Schedule1ParseMetricsV1 {
  pagesParsed: number;
  textItems: number;
  layoutRows: number;
  candidateRows: number;
  contextRows: number;
  tariffLines: number;
  rejectedRows: number;
}

export interface Schedule1ParsePageMetricsV1 {
  pageNumber: number;
  textItems: number;
  layoutRows: number;
  candidateRows: number;
  contextRows: number;
  tariffLines: number;
  rejectedRows: number;
}

export interface Schedule1ParseResultV1 {
  schemaVersion: "za-customs.schedule1-parse-result.v1";
  tariffLines: TariffLineV1[];
  warnings: string[];
  metrics: Schedule1ParseMetricsV1;
  pageMetrics?: Schedule1ParsePageMetricsV1[];
}

export interface Schedule1ExciseLevyContextV1 {
  part: string;
  item: string;
  normalizedItem: string;
  description: string;
  normalizedDescription: string;
  level: number;
  sourceTrace: SourceTraceV1[];
}

export interface Schedule1ExciseLevyLineV1 {
  schemaVersion: "za-customs.schedule1-excise-levy-line.v1";
  part: string;
  item: string;
  normalizedItem: string;
  tariffSubheading: string;
  normalizedTariffSubheading: string;
  description: string;
  normalizedDescription: string;
  rate: DutyRateV1;
  validFrom: string;
  context?: Schedule1ExciseLevyContextV1[];
  sourcePublishedDate?: string | null;
  sourceImplementationDate?: string | null;
  sourceTrace: SourceTraceV1[];
  parseConfidence: number;
  warnings: string[];
}

export interface Schedule1ExciseLeviesParseMetricsV1 {
  pagesParsed: number;
  textItems: number;
  layoutRows: number;
  candidateRows: number;
  contextRows: number;
  exciseLevyLines: number;
  rejectedRows: number;
}

export interface Schedule1ExciseLeviesParsePageMetricsV1 {
  pageNumber: number;
  textItems: number;
  layoutRows: number;
  candidateRows: number;
  contextRows: number;
  exciseLevyLines: number;
  rejectedRows: number;
}

export interface Schedule1ExciseLeviesParseResultV1 {
  schemaVersion: "za-customs.schedule1-excise-levies-parse-result.v1";
  exciseLevyLines: Schedule1ExciseLevyLineV1[];
  warnings: string[];
  metrics: Schedule1ExciseLeviesParseMetricsV1;
  pageMetrics?: Schedule1ExciseLeviesParsePageMetricsV1[];
}

export interface Schedule2TradeRemedyContextV1 {
  item: string;
  normalizedItem: string;
  description: string;
  normalizedDescription: string;
  level: number;
  sourceTrace: SourceTraceV1[];
}

export interface Schedule2TradeRemedyLineV1 {
  schemaVersion: "za-customs.schedule2-trade-remedy-line.v1";
  item: string;
  normalizedItem: string;
  tariffHeading: string;
  normalizedTariffHeading: string;
  code: string;
  normalizedCode: string;
  checkDigit?: string | null;
  description: string;
  normalizedDescription: string;
  rebateItems: string[];
  originatingCountryOrTerritory: string;
  rate: DutyRateV1;
  validFrom: string;
  context?: Schedule2TradeRemedyContextV1[];
  sourcePublishedDate?: string | null;
  sourceImplementationDate?: string | null;
  sourceTrace: SourceTraceV1[];
  parseConfidence: number;
  warnings: string[];
}

export interface Schedule2ParseMetricsV1 {
  pagesParsed: number;
  textItems: number;
  layoutRows: number;
  candidateRows: number;
  contextRows: number;
  tradeRemedyLines: number;
  rejectedRows: number;
}

export interface Schedule2ParsePageMetricsV1 {
  pageNumber: number;
  textItems: number;
  layoutRows: number;
  candidateRows: number;
  contextRows: number;
  tradeRemedyLines: number;
  rejectedRows: number;
}

export interface Schedule2ParseResultV1 {
  schemaVersion: "za-customs.schedule2-parse-result.v1";
  tradeRemedyLines: Schedule2TradeRemedyLineV1[];
  warnings: string[];
  metrics: Schedule2ParseMetricsV1;
  pageMetrics?: Schedule2ParsePageMetricsV1[];
}

export type Schedule3PartV1 = "1" | "2" | "unknown";

export interface Schedule3IndustrialRebateContextV1 {
  part: Schedule3PartV1;
  rebateItem: string;
  normalizedRebateItem: string;
  description: string;
  normalizedDescription: string;
  level: number;
  sourceTrace: SourceTraceV1[];
}

export interface Schedule3IndustrialRebateLineV1 {
  schemaVersion: "za-customs.schedule3-industrial-rebate-line.v1";
  part: Schedule3PartV1;
  rebateItem: string;
  normalizedRebateItem: string;
  tariffHeading: string;
  normalizedTariffHeading: string;
  rebateCode: string;
  normalizedRebateCode: string;
  checkDigit?: string | null;
  description: string;
  normalizedDescription: string;
  extentOfRebate: string;
  validFrom: string;
  context?: Schedule3IndustrialRebateContextV1[];
  sourcePublishedDate?: string | null;
  sourceImplementationDate?: string | null;
  sourceTrace: SourceTraceV1[];
  parseConfidence: number;
  warnings: string[];
}

export interface Schedule3ParseMetricsV1 {
  pagesParsed: number;
  textItems: number;
  layoutRows: number;
  candidateRows: number;
  contextRows: number;
  rebateLines: number;
  rejectedRows: number;
}

export interface Schedule3ParsePageMetricsV1 {
  pageNumber: number;
  textItems: number;
  layoutRows: number;
  candidateRows: number;
  contextRows: number;
  rebateLines: number;
  rejectedRows: number;
}

export interface Schedule3ParseResultV1 {
  schemaVersion: "za-customs.schedule3-parse-result.v1";
  rebateLines: Schedule3IndustrialRebateLineV1[];
  warnings: string[];
  metrics: Schedule3ParseMetricsV1;
  pageMetrics?: Schedule3ParsePageMetricsV1[];
}

export type Schedule4PartV1 = "1" | "2" | "3" | "4" | "5" | "6" | "unknown";

export interface Schedule4RebateContextV1 {
  part: Schedule4PartV1;
  rebateItem: string;
  normalizedRebateItem: string;
  description: string;
  normalizedDescription: string;
  level: number;
  sourceTrace: SourceTraceV1[];
}

export interface Schedule4RebateLineV1 {
  schemaVersion: "za-customs.schedule4-rebate-line.v1";
  part: Schedule4PartV1;
  rebateItem: string;
  normalizedRebateItem: string;
  tariffHeading: string;
  normalizedTariffHeading: string;
  rebateCode: string;
  normalizedRebateCode: string;
  checkDigit?: string | null;
  description: string;
  normalizedDescription: string;
  extentOfRebate: string;
  validFrom: string;
  context?: Schedule4RebateContextV1[];
  sourcePublishedDate?: string | null;
  sourceImplementationDate?: string | null;
  sourceTrace: SourceTraceV1[];
  parseConfidence: number;
  warnings: string[];
}

export interface Schedule4ParseMetricsV1 {
  pagesParsed: number;
  textItems: number;
  layoutRows: number;
  candidateRows: number;
  contextRows: number;
  rebateLines: number;
  rejectedRows: number;
}

export interface Schedule4ParsePageMetricsV1 {
  pageNumber: number;
  textItems: number;
  layoutRows: number;
  candidateRows: number;
  contextRows: number;
  rebateLines: number;
  rejectedRows: number;
}

export interface Schedule4ParseResultV1 {
  schemaVersion: "za-customs.schedule4-parse-result.v1";
  rebateLines: Schedule4RebateLineV1[];
  warnings: string[];
  metrics: Schedule4ParseMetricsV1;
  pageMetrics?: Schedule4ParsePageMetricsV1[];
}

export type Schedule5PartV1 = "1" | "2" | "3" | "4" | "5" | "6" | "unknown";

export interface Schedule5DrawbackRefundContextV1 {
  part: Schedule5PartV1;
  item: string;
  normalizedItem: string;
  description: string;
  normalizedDescription: string;
  level: number;
  sourceTrace: SourceTraceV1[];
}

export interface Schedule5DrawbackRefundLineV1 {
  schemaVersion: "za-customs.schedule5-drawback-refund-line.v1";
  part: Schedule5PartV1;
  item: string;
  normalizedItem: string;
  tariffHeading: string;
  normalizedTariffHeading: string;
  code: string;
  normalizedCode: string;
  checkDigit?: string | null;
  description: string;
  normalizedDescription: string;
  extentOfRefundOrDrawback: string;
  validFrom: string;
  context?: Schedule5DrawbackRefundContextV1[];
  sourcePublishedDate?: string | null;
  sourceImplementationDate?: string | null;
  sourceTrace: SourceTraceV1[];
  parseConfidence: number;
  warnings: string[];
}

export interface Schedule5ParseMetricsV1 {
  pagesParsed: number;
  textItems: number;
  layoutRows: number;
  candidateRows: number;
  contextRows: number;
  drawbackRefundLines: number;
  rejectedRows: number;
}

export interface Schedule5ParsePageMetricsV1 {
  pageNumber: number;
  textItems: number;
  layoutRows: number;
  candidateRows: number;
  contextRows: number;
  drawbackRefundLines: number;
  rejectedRows: number;
}

export interface Schedule5ParseResultV1 {
  schemaVersion: "za-customs.schedule5-parse-result.v1";
  drawbackRefundLines: Schedule5DrawbackRefundLineV1[];
  warnings: string[];
  metrics: Schedule5ParseMetricsV1;
  pageMetrics?: Schedule5ParsePageMetricsV1[];
}

export type Schedule6PartV1 = string;

export interface Schedule6ExciseRebateRefundContextV1 {
  part: Schedule6PartV1;
  item: string;
  normalizedItem: string;
  description: string;
  normalizedDescription: string;
  level: number;
  sourceTrace: SourceTraceV1[];
}

export interface Schedule6ExciseRebateRefundLineV1 {
  schemaVersion: "za-customs.schedule6-excise-rebate-refund-line.v1";
  part: Schedule6PartV1;
  item: string;
  normalizedItem: string;
  tariffItem: string;
  normalizedTariffItem: string;
  rebateCode: string;
  normalizedRebateCode: string;
  checkDigit?: string | null;
  description: string;
  normalizedDescription: string;
  extentOfRebate: string;
  extentOfRefund: string;
  validFrom: string;
  context?: Schedule6ExciseRebateRefundContextV1[];
  sourcePublishedDate?: string | null;
  sourceImplementationDate?: string | null;
  sourceTrace: SourceTraceV1[];
  parseConfidence: number;
  warnings: string[];
}

export interface Schedule6ParseMetricsV1 {
  pagesParsed: number;
  textItems: number;
  layoutRows: number;
  candidateRows: number;
  contextRows: number;
  exciseRebateRefundLines: number;
  rejectedRows: number;
}

export interface Schedule6ParsePageMetricsV1 {
  pageNumber: number;
  textItems: number;
  layoutRows: number;
  candidateRows: number;
  contextRows: number;
  exciseRebateRefundLines: number;
  rejectedRows: number;
}

export interface Schedule6ParseResultV1 {
  schemaVersion: "za-customs.schedule6-parse-result.v1";
  exciseRebateRefundLines: Schedule6ExciseRebateRefundLineV1[];
  warnings: string[];
  metrics: Schedule6ParseMetricsV1;
  pageMetrics?: Schedule6ParsePageMetricsV1[];
}

export interface Schedule1LineInspectionV1 {
  schemaVersion: "za-customs.schedule1-line-inspection.v1";
  tariffCode: string;
  normalizedTariffCode: string;
  description: string;
  normalizedDescription: string;
  hierarchy: Array<{
    code: string;
    normalizedCode: string;
    description: string;
    normalizedDescription: string;
    sourcePage?: number | null;
    locator?: string | null;
    rawSourceText?: string | null;
  }>;
  rates: Partial<Record<CustomsRateColumnV1, Pick<DutyRateV1, "raw" | "kind" | "warnings">>>;
  sourcePage?: number | null;
  locator?: string | null;
  rawSourceText?: string | null;
  warnings: string[];
  confidence: number;
}

export type Schedule1QaIssueCategoryV1 =
  | "line_without_context"
  | "context_code_prefix_mismatch"
  | "suspicious_context_jump"
  | "low_confidence_line"
  | "unknown_or_formula_rate"
  | "continuation_row"
  | "duplicate_normalized_code"
  | "page_high_rejection_count";

export interface Schedule1QaIssueV1 {
  category: Schedule1QaIssueCategoryV1;
  severity: "info" | "warning" | "error";
  message: string;
  tariffCode?: string | null;
  normalizedTariffCode?: string | null;
  page?: number | null;
  sourceTrace?: SourceTraceV1[];
}

export interface Schedule1QaReportV1 {
  schemaVersion: "za-customs.schedule1-qa-report.v1";
  summary: {
    tariffLines: number;
    linesWithoutContext: number;
    contextPrefixMismatches: number;
    suspiciousContextJumps: number;
    lowConfidenceLines: number;
    unknownOrFormulaRateLines: number;
    continuationRows: number;
    duplicateNormalizedCodes: number;
    pagesWithHighRejectionCounts: number;
  };
  issues: Schedule1QaIssueV1[];
  reviewSet: Schedule1LineInspectionV1[];
  warnings: string[];
}

export type ScheduleFamilyV1 =
  | "schedule1-excise-levies"
  | "schedule2"
  | "schedule3"
  | "schedule4"
  | "schedule5"
  | "schedule6";

export type ScheduleFamilyQaIssueCategoryV1 =
  | "low_confidence_line"
  | "continuation_row"
  | "duplicate_normalized_family_key"
  | "missing_source_trace"
  | "missing_required_field"
  | "page_high_rejection_count";

export interface ScheduleFamilyQaIssueV1 {
  category: ScheduleFamilyQaIssueCategoryV1;
  severity: "info" | "warning" | "error";
  message: string;
  schedule: ScheduleFamilyV1;
  lineKey?: string | null;
  normalizedLineKey?: string | null;
  field?: string | null;
  page?: number | null;
  sourceTrace?: SourceTraceV1[];
}

export interface ScheduleFamilyQaReportV1 {
  schemaVersion: "za-customs.schedule-family-qa-report.v1";
  schedule: ScheduleFamilyV1;
  summary: {
    lines: number;
    lowConfidenceLines: number;
    continuationRows: number;
    duplicateNormalizedFamilyKeys: number;
    linesMissingSourceTrace: number;
    missingRequiredFields: number;
    pagesWithHighRejectionCounts: number;
  };
  issues: ScheduleFamilyQaIssueV1[];
  warnings: string[];
}
