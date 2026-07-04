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

export interface TariffLineV1 {
  schemaVersion: "za-customs.tariff-line.v1";
  tariffCode: string;
  normalizedTariffCode: string;
  checkDigit?: string | null;
  description: string;
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
  sourcePublishedDate?: string | null;
  sourceImplementationDate?: string | null;
  sourceTrace: SourceTraceV1[];
  parseConfidence: number;
  warnings: string[];
}

export interface CustomsRulesetV1 {
  schemaVersion: "za-customs.customs-ruleset.v1";
  manifest: RulesetManifestV1;
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
