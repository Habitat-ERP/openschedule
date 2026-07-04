import type { RulesetManifestV1, SourceTraceV1 } from "@openschedule/core";

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

export type CustomsRateColumnV1 = "general" | "euUk" | "efta" | "sadc" | "mercosur" | "afcfta";

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

export interface Schedule1ParseResultV1 {
  schemaVersion: "za-customs.schedule1-parse-result.v1";
  tariffLines: TariffLineV1[];
  warnings: string[];
  metrics: Schedule1ParseMetricsV1;
}
