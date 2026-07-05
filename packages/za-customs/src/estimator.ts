import { findTariffLine } from "./rulesets.js";
import {
  CUSTOMS_RATE_COLUMNS,
  type CustomsDutyEstimateV1,
  type CustomsRateColumnV1,
  type CustomsRateOptionV1,
  type DutyRateComponentV1,
  type DutyRateV1,
  type EstimateCustomsDutyOptionsV1,
  type TariffLineV1
} from "./types.js";

export function listRateOptions(ruleset: EstimateCustomsDutyOptionsV1["ruleset"], tariffCode: string): CustomsRateOptionV1[] {
  const line = findTariffLine(ruleset, tariffCode);
  if (!line) return [];
  return CUSTOMS_RATE_COLUMNS.flatMap((column) => {
    const rate = line.rates[column];
    return rate ? [{ column, raw: rate.raw, kind: rate.kind, warnings: rate.warnings, sourceTrace: line.sourceTrace }] : [];
  });
}

export function estimateCustomsDuty(options: EstimateCustomsDutyOptionsV1): CustomsDutyEstimateV1 {
  const warnings: string[] = [];
  const rateColumn = options.rateColumn ?? options.preferenceClaim?.agreement ?? "general";
  const matchingLines = findEffectiveLines(options);

  if (rateColumn !== "general") {
    warnings.push(
      `Preferential rate selected from ${formatRateColumn(rateColumn)} column; origin qualification and certificate validity were not verified.`
    );
  }

  if (!matchingLines.length) {
    return estimateResult(options, rateColumn, null, [], [`No tariff line found for ${options.tariffCode}.`, ...warnings]);
  }
  if (matchingLines.length > 1) {
    return estimateResult(options, rateColumn, null, matchingLines.flatMap((line) => line.sourceTrace), [
      `Multiple effective records found for ${options.tariffCode}; no estimate was calculated.`,
      ...warnings
    ]);
  }

  const line = matchingLines[0];
  const rate = line.rates[rateColumn];
  if (!rate) {
    return estimateResult(options, rateColumn, null, line.sourceTrace, [
      `Rate column ${rateColumn} is not available for ${line.tariffCode}.`,
      ...warnings
    ]);
  }
  if (line.parseConfidence < 0.85) {
    warnings.push(`Parser confidence is ${line.parseConfidence}; verify the source trace before relying on this estimate.`);
  }
  warnings.push(...line.warnings, ...rate.warnings);

  const amount = calculateRate(rate, options, warnings);
  return estimateResult(options, rateColumn, amount, line.sourceTrace, warnings);
}

function findEffectiveLines(options: EstimateCustomsDutyOptionsV1): TariffLineV1[] {
  const normalized = options.tariffCode.replace(/\D/g, "");
  return options.ruleset.tariffLines.filter((line) => {
    if (line.normalizedTariffCode !== normalized) return false;
    if (line.validFrom !== "unknown" && line.validFrom > options.effectiveDate) return false;
    if (line.validTo && line.validTo < options.effectiveDate) return false;
    return true;
  });
}

function calculateRate(rate: DutyRateV1, options: EstimateCustomsDutyOptionsV1, warnings: string[]): number | null {
  if (rate.kind === "free") return 0;
  if (rate.kind === "ad_valorem") return calculateComponents(rate.components, options, warnings);
  if (rate.kind === "specific") return calculateComponents(rate.components, options, warnings);
  if (rate.kind === "compound") {
    if (!/\bplus\b|\+/i.test(rate.raw) || /\bor\b|maximum|minimum/i.test(rate.raw)) {
      warnings.push(`Compound rate "${rate.raw}" is not mechanically clear; no estimate was calculated.`);
      return null;
    }
    return calculateComponents(rate.components, options, warnings);
  }

  warnings.push(`Rate "${rate.raw}" is ${rate.kind}; no estimate was calculated.`);
  return null;
}

function calculateComponents(
  components: readonly DutyRateComponentV1[],
  options: EstimateCustomsDutyOptionsV1,
  warnings: string[]
): number | null {
  if (!components.length) {
    warnings.push("Rate has no mechanically calculable components.");
    return null;
  }

  let total = 0;
  for (const component of components) {
    if (isAdValoremComponent(component)) {
      if (!isNonNegativeNumber(options.customsValue)) {
        warnings.push("customsValue is required for ad valorem rate calculation.");
        return null;
      }
      total += options.customsValue * component.rate;
      continue;
    }
    if (isSpecificComponent(component)) {
      if (!isNonNegativeNumber(options.quantity) || !options.quantityUnit) {
        warnings.push("quantity and quantityUnit are required for specific rate calculation.");
        return null;
      }
      if (options.quantityUnit.toLowerCase() !== component.unit.toLowerCase()) {
        warnings.push(`quantityUnit ${options.quantityUnit} does not match rate unit ${component.unit}.`);
        return null;
      }
      total += (component.amount / 100) * (options.quantity / component.perQuantity);
      continue;
    }
    warnings.push("Rate component is not mechanically calculable.");
    return null;
  }
  return roundCurrency(total);
}

function estimateResult(
  options: EstimateCustomsDutyOptionsV1,
  rateColumn: CustomsRateColumnV1,
  estimatedDuty: number | null,
  sourceTrace: TariffLineV1["sourceTrace"],
  warnings: string[]
): CustomsDutyEstimateV1 {
  return {
    schemaVersion: "za-customs.duty-estimate.v1",
    estimatedDuty,
    currency: "ZAR",
    rulesetId: options.ruleset.manifest.rulesetId,
    tariffCode: options.tariffCode,
    rateColumn,
    effectiveDate: options.effectiveDate,
    sourceTrace,
    warnings: Array.from(new Set(warnings))
  };
}

function isAdValoremComponent(component: DutyRateComponentV1): component is DutyRateComponentV1 & { rate: number } {
  return "basis" in component && component.basis === "customs_value" && "rate" in component && typeof component.rate === "number";
}

function isSpecificComponent(
  component: DutyRateComponentV1
): component is DutyRateComponentV1 & { amount: number; perQuantity: number; unit: string } {
  return (
    "amount" in component &&
    "perQuantity" in component &&
    "unit" in component &&
    typeof component.amount === "number" &&
    typeof component.perQuantity === "number" &&
    typeof component.unit === "string"
  );
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function formatRateColumn(column: CustomsRateColumnV1): string {
  if (column === "euUk") return "EU / UK";
  if (column === "afcfta") return "AfCFTA";
  return column.toUpperCase();
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
