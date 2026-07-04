import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCustomsRuleset,
  estimateCustomsDuty,
  listRateOptions
} from "../dist/src/index.js";

const sourceDocumentSha256 = "0".repeat(64);
const sourceTrace = {
  schemaVersion: "core.source-trace.v1",
  sourceDocumentSha256,
  page: 1,
  locator: "synthetic fixture",
  text: "synthetic source text"
};
const sourceDocument = {
  schemaVersion: "core.source-document-metadata.v1",
  sha256: sourceDocumentSha256,
  fileName: "schedule.pdf"
};

function rate(raw, kind, components = [], warnings = []) {
  return { raw, kind, components, warnings };
}

function tariffLine(overrides = {}) {
  const tariffCode = overrides.tariffCode ?? "0001.10";
  return {
    schemaVersion: "za-customs.tariff-line.v1",
    tariffCode,
    normalizedTariffCode: tariffCode.replace(/\D/g, ""),
    checkDigit: "1",
    description: overrides.description ?? "Synthetic goods",
    normalizedDescription: overrides.normalizedDescription ?? "Synthetic goods",
    statisticalUnit: overrides.statisticalUnit ?? "kg",
    rates: overrides.rates ?? {
      general: rate("10%", "ad_valorem", [{ basis: "customs_value", rate: 0.1 }]),
      sadc: rate("free", "free")
    },
    validFrom: "2026-05-29",
    sourceTrace: [sourceTrace],
    parseConfidence: overrides.parseConfidence ?? 1,
    warnings: overrides.warnings ?? []
  };
}

function ruleset(lines) {
  return buildCustomsRuleset({
    parseResult: {
      schemaVersion: "za-customs.schedule1-parse-result.v1",
      tariffLines: lines,
      warnings: [],
      metrics: {
        pagesParsed: 1,
        textItems: 1,
        layoutRows: 1,
        candidateRows: lines.length,
        contextRows: 0,
        tariffLines: lines.length,
        rejectedRows: 0
      }
    },
    sourceDocuments: [sourceDocument],
    generatedAt: "2026-07-04T00:00:00.000Z",
    effectiveDate: "2026-05-29"
  });
}

test("lists available rate columns for an exact tariff code", () => {
  const built = ruleset([tariffLine()]);
  assert.deepEqual(listRateOptions(built, "000110").map((option) => option.column), ["general", "sadc"]);
  assert.deepEqual(listRateOptions(built, "9999.00"), []);
});

test("estimates free, ad valorem, specific, and clear plus compound rates", () => {
  const built = ruleset([
    tariffLine(),
    tariffLine({
      tariffCode: "0001.20",
      rates: {
        general: rate("5,5c/kg", "specific", [{ amount: 5.5, currency: "ZAc", perQuantity: 1, unit: "kg" }])
      }
    }),
    tariffLine({
      tariffCode: "0001.30",
      rates: {
        general: rate("10% plus 5,5c/kg", "compound", [
          { basis: "customs_value", rate: 0.1 },
          { amount: 5.5, currency: "ZAc", perQuantity: 1, unit: "kg" }
        ])
      }
    })
  ]);

  assert.equal(estimateCustomsDuty({ ruleset: built, tariffCode: "0001.10", customsValue: 1000, effectiveDate: "2026-07-04" }).estimatedDuty, 100);
  assert.equal(estimateCustomsDuty({ ruleset: built, tariffCode: "0001.10", preferenceClaim: { agreement: "sadc" }, effectiveDate: "2026-07-04" }).estimatedDuty, 0);
  assert.equal(estimateCustomsDuty({ ruleset: built, tariffCode: "0001.20", quantity: 200, quantityUnit: "kg", effectiveDate: "2026-07-04" }).estimatedDuty, 11);
  assert.equal(estimateCustomsDuty({ ruleset: built, tariffCode: "0001.30", customsValue: 1000, quantity: 200, quantityUnit: "kg", effectiveDate: "2026-07-04" }).estimatedDuty, 111);
});

test("returns warnings instead of guesses for unresolved rates and inputs", () => {
  const built = ruleset([
    tariffLine({
      rates: {
        general: rate("5,5c/kg", "specific", [{ amount: 5.5, currency: "ZAc", perQuantity: 1, unit: "kg" }])
      },
      parseConfidence: 0.5
    }),
    tariffLine({
      tariffCode: "0001.20",
      rates: {
        general: rate("30% or 500c/2u", "compound", [
          { basis: "customs_value", rate: 0.3 },
          { amount: 500, currency: "ZAc", perQuantity: 2, unit: "u" }
        ])
      }
    }),
    tariffLine({
      tariffCode: "0001.30",
      rates: {
        general: rate("See Note 1", "formula")
      }
    }),
    tariffLine({ tariffCode: "0001.40" })
  ]);

  const missingQuantity = estimateCustomsDuty({ ruleset: built, tariffCode: "0001.10", effectiveDate: "2026-07-04" });
  const negativeValue = estimateCustomsDuty({ ruleset: built, tariffCode: "0001.40", customsValue: -1, effectiveDate: "2026-07-04" });
  const ambiguousCompound = estimateCustomsDuty({ ruleset: built, tariffCode: "0001.20", customsValue: 1000, quantity: 1, quantityUnit: "u", effectiveDate: "2026-07-04" });
  const formula = estimateCustomsDuty({ ruleset: built, tariffCode: "0001.30", customsValue: 1000, effectiveDate: "2026-07-04" });
  const missingCode = estimateCustomsDuty({ ruleset: built, tariffCode: "9999.99", effectiveDate: "2026-07-04" });

  assert.equal(missingQuantity.estimatedDuty, null);
  assert.ok(missingQuantity.warnings.some((warning) => warning.includes("quantity and quantityUnit")));
  assert.ok(missingQuantity.warnings.some((warning) => warning.includes("Parser confidence")));
  assert.equal(negativeValue.estimatedDuty, null);
  assert.ok(negativeValue.warnings.some((warning) => warning.includes("customsValue")));
  assert.equal(ambiguousCompound.estimatedDuty, null);
  assert.ok(ambiguousCompound.warnings.some((warning) => warning.includes("not mechanically clear")));
  assert.equal(formula.estimatedDuty, null);
  assert.ok(formula.warnings.some((warning) => warning.includes("formula")));
  assert.equal(missingCode.estimatedDuty, null);
  assert.ok(missingCode.warnings.some((warning) => warning.includes("No tariff line")));
});
