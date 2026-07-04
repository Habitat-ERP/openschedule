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
