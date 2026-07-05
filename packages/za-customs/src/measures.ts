import type { SourceTraceV1 } from "@openschedule/core";
import type {
  CustomsRateColumnV1,
  CustomsRulesetContainerV1,
  DutyRateComponentV1,
  DutyRateKindV1,
  DutyRateV1,
  TariffLineV1
} from "./types.js";

export type ZaCustomsMeasureKind =
  | "ordinary-duty"
  | "excise-levy"
  | "trade-remedy"
  | "rebate"
  | "drawback"
  | "refund"
  | "drawback-or-refund";

export type ZaCustomsMeasureSchedule = "1" | "2" | "3" | "4" | "5" | "6";

export interface ZaCustomsMetadataOptions {
  includeMetadata?: boolean;
}

export interface ZaCustomsMeasureMetadata {
  confidence: number;
  warnings: string[];
  sourceTrace: SourceTraceV1[];
}

export interface ZaCustomsDutyRateMetadata {
  warnings: string[];
}

export interface ZaCustomsDutyRate {
  raw: string;
  kind: DutyRateKindV1;
  components: DutyRateComponentV1[];
  metadata?: ZaCustomsDutyRateMetadata;
}

export interface ZaCustomsRateTable {
  general: ZaCustomsDutyRate;
  euUk?: ZaCustomsDutyRate;
  efta?: ZaCustomsDutyRate;
  sadc?: ZaCustomsDutyRate;
  mercosur?: ZaCustomsDutyRate;
  afcfta?: ZaCustomsDutyRate;
}

export interface ZaCustomsMeasure {
  id: string;
  kind: ZaCustomsMeasureKind;
  schedule: ZaCustomsMeasureSchedule;
  part?: string;
  item?: string;
  normalizedItem?: string;
  code?: string;
  normalizedCode?: string;
  tariffCode?: string;
  normalizedTariffCode?: string;
  tariffSubheading?: string;
  normalizedTariffSubheading?: string;
  tariffHeading?: string;
  normalizedTariffHeading?: string;
  tariffItem?: string;
  normalizedTariffItem?: string;
  origin?: string;
  description: string;
  normalizedDescription: string;
  rates?: ZaCustomsRateTable;
  rate?: ZaCustomsDutyRate;
  extent?: string;
  validFrom: string;
  validTo?: string | null;
  metadata?: ZaCustomsMeasureMetadata;
}

export interface ZaCustomsMeasureFilter extends ZaCustomsMetadataOptions {
  kind?: ZaCustomsMeasureKind | readonly ZaCustomsMeasureKind[];
  schedule?: string | readonly string[];
  part?: string | readonly string[];
  tariffCode?: string;
  tariffPrefix?: string;
  tariffHeading?: string;
  tariffHeadingPrefix?: string;
  tariffItem?: string;
  tariffItemPrefix?: string;
  item?: string;
  itemPrefix?: string;
  code?: string;
  codePrefix?: string;
  origin?: string;
  rateColumn?: CustomsRateColumnV1;
  effectiveDate?: string;
  limit?: number;
  cursor?: string;
}

export interface ZaCustomsMeasurePage {
  items: ZaCustomsMeasure[];
  nextCursor: string | null;
}

interface InternalZaCustomsMeasure extends Omit<ZaCustomsMeasure, "metadata" | "rates" | "rate"> {
  rates?: TariffLineV1["rates"];
  rate?: DutyRateV1;
  confidence: number;
  warnings: string[];
  sourceTrace: SourceTraceV1[];
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export function listCustomsMeasures(
  container: CustomsRulesetContainerV1,
  filter: ZaCustomsMeasureFilter = {}
): ZaCustomsMeasurePage {
  const limit = Math.min(Math.max(Math.trunc(filter.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
  const matched = allMeasures(container)
    .filter((measure) => matchesFilter(measure, filter))
    .sort((left, right) => left.id.localeCompare(right.id));
  const cursor = filter.cursor;
  const items = cursor ? matched.filter((measure) => measure.id > cursor) : matched;
  const page = items.slice(0, limit);
  return {
    items: page.map((measure) => publicMeasure(measure, filter)),
    nextCursor: items.length > page.length ? page.at(-1)?.id ?? null : null
  };
}

export function listCustomsDuties(
  container: CustomsRulesetContainerV1,
  filter: Omit<ZaCustomsMeasureFilter, "kind"> = {}
): ZaCustomsMeasurePage {
  return listCustomsMeasures(container, {
    ...filter,
    kind: ["ordinary-duty", "excise-levy", "trade-remedy"]
  });
}

export function listCustomsReliefs(
  container: CustomsRulesetContainerV1,
  filter: Omit<ZaCustomsMeasureFilter, "kind"> = {}
): ZaCustomsMeasurePage {
  return listCustomsMeasures(container, {
    ...filter,
    kind: ["rebate", "drawback", "refund", "drawback-or-refund"]
  });
}

function allMeasures(container: CustomsRulesetContainerV1): InternalZaCustomsMeasure[] {
  return [
    ...container.schedule1Part1.tariffLines.map((line) => ({
      id: `ordinary-duty:1:${line.normalizedTariffCode}`,
      kind: "ordinary-duty" as const,
      schedule: "1" as const,
      tariffCode: line.tariffCode,
      normalizedTariffCode: line.normalizedTariffCode,
      description: line.description,
      normalizedDescription: line.normalizedDescription,
      rates: line.rates,
      validFrom: line.validFrom,
      validTo: line.validTo,
      confidence: line.parseConfidence,
      warnings: line.warnings,
      sourceTrace: line.sourceTrace
    })),
    ...(container.schedule1ExciseLevies?.exciseLevyLines.map((line) => ({
      id: `excise-levy:1:${line.part}:${line.normalizedItem}:${line.normalizedTariffSubheading}`,
      kind: "excise-levy" as const,
      schedule: "1" as const,
      part: line.part,
      item: line.item,
      normalizedItem: line.normalizedItem,
      tariffSubheading: line.tariffSubheading,
      normalizedTariffSubheading: line.normalizedTariffSubheading,
      description: line.description,
      normalizedDescription: line.normalizedDescription,
      rate: line.rate,
      validFrom: line.validFrom,
      confidence: line.parseConfidence,
      warnings: line.warnings,
      sourceTrace: line.sourceTrace
    })) ?? []),
    ...(container.schedule2?.tradeRemedyLines.map((line) => ({
      id: `trade-remedy:2:${line.normalizedItem}:${line.normalizedTariffHeading}:${line.normalizedCode}`,
      kind: "trade-remedy" as const,
      schedule: "2" as const,
      item: line.item,
      normalizedItem: line.normalizedItem,
      code: line.code,
      normalizedCode: line.normalizedCode,
      tariffHeading: line.tariffHeading,
      normalizedTariffHeading: line.normalizedTariffHeading,
      origin: line.originatingCountryOrTerritory,
      description: line.description,
      normalizedDescription: line.normalizedDescription,
      rate: line.rate,
      validFrom: line.validFrom,
      confidence: line.parseConfidence,
      warnings: line.warnings,
      sourceTrace: line.sourceTrace
    })) ?? []),
    ...(container.schedule3?.rebateLines.map((line) => rebateMeasure("3", line.part, line.rebateItem, line.normalizedRebateItem, line.tariffHeading, line.normalizedTariffHeading, line.rebateCode, line.normalizedRebateCode, line.description, line.normalizedDescription, line.extentOfRebate, line.validFrom, line.parseConfidence, line.warnings, line.sourceTrace)) ?? []),
    ...(container.schedule4?.rebateLines.map((line) => rebateMeasure("4", line.part, line.rebateItem, line.normalizedRebateItem, line.tariffHeading, line.normalizedTariffHeading, line.rebateCode, line.normalizedRebateCode, line.description, line.normalizedDescription, line.extentOfRebate, line.validFrom, line.parseConfidence, line.warnings, line.sourceTrace)) ?? []),
    ...(container.schedule5?.drawbackRefundLines.map((line) => ({
      id: `drawback-or-refund:5:${line.part}:${line.normalizedItem}:${line.normalizedTariffHeading}:${line.normalizedCode}`,
      kind: "drawback-or-refund" as const,
      schedule: "5" as const,
      part: line.part,
      item: line.item,
      normalizedItem: line.normalizedItem,
      tariffHeading: line.tariffHeading,
      normalizedTariffHeading: line.normalizedTariffHeading,
      code: line.code,
      normalizedCode: line.normalizedCode,
      description: line.description,
      normalizedDescription: line.normalizedDescription,
      extent: line.extentOfRefundOrDrawback,
      validFrom: line.validFrom,
      confidence: line.parseConfidence,
      warnings: line.warnings,
      sourceTrace: line.sourceTrace
    })) ?? []),
    ...(container.schedule6?.exciseRebateRefundLines.flatMap((line) => {
      const base = {
        schedule: "6" as const,
        part: line.part,
        item: line.item,
        normalizedItem: line.normalizedItem,
        tariffItem: line.tariffItem,
        normalizedTariffItem: line.normalizedTariffItem,
        code: line.rebateCode,
        normalizedCode: line.normalizedRebateCode,
        description: line.description,
        normalizedDescription: line.normalizedDescription,
        validFrom: line.validFrom,
        confidence: line.parseConfidence,
        warnings: line.warnings,
        sourceTrace: line.sourceTrace
      };
      const measures: InternalZaCustomsMeasure[] = [];
      if (line.extentOfRebate) {
        measures.push({
          ...base,
          id: `rebate:6:${line.part}:${line.normalizedItem}:${line.normalizedTariffItem}:${line.normalizedRebateCode}`,
          kind: "rebate",
          extent: line.extentOfRebate
        });
      }
      if (line.extentOfRefund) {
        measures.push({
          ...base,
          id: `refund:6:${line.part}:${line.normalizedItem}:${line.normalizedTariffItem}:${line.normalizedRebateCode}`,
          kind: "refund",
          extent: line.extentOfRefund
        });
      }
      return measures;
    }) ?? [])
  ];
}

function rebateMeasure(
  schedule: ZaCustomsMeasureSchedule,
  part: string,
  item: string,
  normalizedItem: string,
  tariffHeading: string,
  normalizedTariffHeading: string,
  code: string,
  normalizedCode: string,
  description: string,
  normalizedDescription: string,
  extent: string,
  validFrom: string,
  confidence: number,
  warnings: string[],
  sourceTrace: SourceTraceV1[]
): InternalZaCustomsMeasure {
  return {
    id: `rebate:${schedule}:${part}:${normalizedItem}:${normalizedTariffHeading}:${normalizedCode}`,
    kind: "rebate",
    schedule,
    part,
    item,
    normalizedItem,
    tariffHeading,
    normalizedTariffHeading,
    code,
    normalizedCode,
    description,
    normalizedDescription,
    extent,
    validFrom,
    confidence,
    warnings,
    sourceTrace
  };
}

function publicMeasure(measure: InternalZaCustomsMeasure, options: ZaCustomsMetadataOptions): ZaCustomsMeasure {
  const { confidence, warnings, sourceTrace, rates, rate, ...publicFields } = measure;
  return {
    ...publicFields,
    ...(rates ? { rates: publicRates(rates, options) } : {}),
    ...(rate ? { rate: publicDutyRate(rate, options) } : {}),
    ...(options.includeMetadata ? { metadata: { confidence, warnings, sourceTrace } } : {})
  };
}

function publicRates(rates: TariffLineV1["rates"], options: ZaCustomsMetadataOptions): ZaCustomsRateTable {
  return {
    general: publicDutyRate(rates.general, options),
    ...(rates.euUk ? { euUk: publicDutyRate(rates.euUk, options) } : {}),
    ...(rates.efta ? { efta: publicDutyRate(rates.efta, options) } : {}),
    ...(rates.sadc ? { sadc: publicDutyRate(rates.sadc, options) } : {}),
    ...(rates.mercosur ? { mercosur: publicDutyRate(rates.mercosur, options) } : {}),
    ...(rates.afcfta ? { afcfta: publicDutyRate(rates.afcfta, options) } : {})
  };
}

function publicDutyRate(rate: DutyRateV1, options: ZaCustomsMetadataOptions): ZaCustomsDutyRate {
  return {
    raw: rate.raw,
    kind: rate.kind,
    components: rate.components,
    ...(options.includeMetadata ? { metadata: { warnings: rate.warnings } } : {})
  };
}

function matchesFilter(measure: InternalZaCustomsMeasure, filter: ZaCustomsMeasureFilter): boolean {
  if (!matchesSet(measure.kind, filter.kind)) return false;
  if (!matchesSet(measure.schedule, filter.schedule)) return false;
  if (filter.part !== undefined && !matchesSet(measure.part ?? "", filter.part)) return false;
  if (filter.origin !== undefined && measure.origin !== filter.origin) return false;
  if (filter.rateColumn !== undefined && !measure.rates?.[filter.rateColumn]) return false;
  if (filter.effectiveDate && !isEffective(measure, filter.effectiveDate)) return false;
  if (filter.tariffCode && !matchesTariffCode(measure, normalize(filter.tariffCode))) return false;
  if (filter.tariffPrefix && !targetCodes(measure).some((code) => code.startsWith(normalize(filter.tariffPrefix!)))) return false;
  if (filter.tariffHeading && measure.normalizedTariffHeading !== normalize(filter.tariffHeading)) return false;
  if (filter.tariffHeadingPrefix && !measure.normalizedTariffHeading?.startsWith(normalize(filter.tariffHeadingPrefix))) return false;
  if (filter.tariffItem && measure.normalizedTariffItem !== normalize(filter.tariffItem)) return false;
  if (filter.tariffItemPrefix && !measure.normalizedTariffItem?.startsWith(normalize(filter.tariffItemPrefix))) return false;
  if (filter.item && measure.normalizedItem !== normalize(filter.item)) return false;
  if (filter.itemPrefix && !measure.normalizedItem?.startsWith(normalize(filter.itemPrefix))) return false;
  if (filter.code && measure.normalizedCode !== normalize(filter.code)) return false;
  if (filter.codePrefix && !measure.normalizedCode?.startsWith(normalize(filter.codePrefix))) return false;
  return true;
}

function matchesSet<T extends string>(value: T, filter: T | readonly T[] | undefined): boolean {
  return filter === undefined || (Array.isArray(filter) ? filter.includes(value) : value === filter);
}

function matchesTariffCode(measure: InternalZaCustomsMeasure, normalized: string): boolean {
  if (measure.normalizedTariffCode) return measure.normalizedTariffCode === normalized;
  return targetCodes(measure).some((code) => normalized.startsWith(code));
}

function targetCodes(measure: InternalZaCustomsMeasure): string[] {
  return [
    measure.normalizedTariffCode,
    measure.normalizedTariffSubheading,
    measure.normalizedTariffHeading,
    measure.normalizedTariffItem
  ].filter((value): value is string => Boolean(value));
}

function isEffective(measure: InternalZaCustomsMeasure, effectiveDate: string): boolean {
  if (measure.validFrom !== "unknown" && measure.validFrom > effectiveDate) return false;
  if (measure.validTo && measure.validTo < effectiveDate) return false;
  return true;
}

function cursorOffset(cursor: string | undefined): number {
  if (!cursor) return 0;
  const value = Number(cursor);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function normalize(value: string): string {
  return value.replace(/\D/g, "");
}
