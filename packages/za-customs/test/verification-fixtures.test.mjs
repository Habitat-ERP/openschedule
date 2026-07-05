import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCustomsRuleset,
  estimateCustomsDuty
} from "../dist/src/internal.js";

const sourceDocumentSha256 = "0".repeat(64);
const sourceDocument = {
  schemaVersion: "core.source-document-metadata.v1",
  sha256: sourceDocumentSha256,
  fileName: "synthetic-verification.pdf",
  sourceIdentifier: "SYNTHETIC_VERIFICATION_FIXTURE"
};
const sourceTrace = {
  schemaVersion: "core.source-trace.v1",
  sourceDocumentSha256,
  page: 1,
  locator: "synthetic verification fixture",
  text: "Synthetic fixture for mechanical duty verification"
};

function rate(raw, kind, components = [], warnings = []) {
  return { raw, kind, components, warnings };
}

function tariffLine(tariffCode, rates) {
  return {
    schemaVersion: "za-customs.tariff-line.v1",
    tariffCode,
    normalizedTariffCode: tariffCode.replace(/\D/g, ""),
    checkDigit: "0",
    description: `Synthetic verification ${tariffCode}`,
    normalizedDescription: `Synthetic verification ${tariffCode}`,
    statisticalUnit: "kg",
    rates,
    validFrom: "2026-01-01",
    sourceTrace: [sourceTrace],
    parseConfidence: 1,
    warnings: []
  };
}

const ruleset = buildCustomsRuleset({
  parseResult: {
    schemaVersion: "za-customs.schedule1-parse-result.v1",
    tariffLines: [
      tariffLine("0001.10", {
        general: rate("10%", "ad_valorem", [{ basis: "customs_value", rate: 0.1 }]),
        sadc: rate("free", "free")
      }),
      tariffLine("0001.20", {
        general: rate("5,5c/kg", "specific", [{ amount: 5.5, currency: "ZAc", perQuantity: 1, unit: "kg" }])
      }),
      tariffLine("0001.30", {
        general: rate("10% plus 5,5c/kg", "compound", [
          { basis: "customs_value", rate: 0.1 },
          { amount: 5.5, currency: "ZAc", perQuantity: 1, unit: "kg" }
        ])
      }),
      tariffLine("0001.40", {
        general: rate("free", "free")
      }),
      tariffLine("0001.50", {
        general: rate("12,5%", "ad_valorem", [{ basis: "customs_value", rate: 0.125 }]),
        mercosur: rate("5%", "ad_valorem", [{ basis: "customs_value", rate: 0.05 }])
      }),
      tariffLine("0001.60", {
        general: rate("200c/2kg", "specific", [{ amount: 200, currency: "ZAc", perQuantity: 2, unit: "kg" }])
      }),
      tariffLine("0001.70", {
        general: rate("7,5% plus 200c/2kg", "compound", [
          { basis: "customs_value", rate: 0.075 },
          { amount: 200, currency: "ZAc", perQuantity: 2, unit: "kg" }
        ])
      }),
      tariffLine("0001.80", {
        general: rate("See Note 1", "formula")
      }),
      tariffLine("0001.90", {
        general: rate("30% or 500c/2kg", "compound", [
          { basis: "customs_value", rate: 0.3 },
          { amount: 500, currency: "ZAc", perQuantity: 2, unit: "kg" }
        ])
      })
    ],
    warnings: [],
    metrics: {
      pagesParsed: 1,
      textItems: 1,
      layoutRows: 1,
      candidateRows: 9,
      contextRows: 0,
      tariffLines: 9,
      rejectedRows: 0
    }
  },
  sourceDocuments: [sourceDocument],
  generatedAt: "2026-07-05T00:00:00.000Z",
  effectiveDate: "2026-01-01"
});

const verificationCases = [
  ...[0, 1, 10, 99.99, 100, 123.45, 999.99, 1000, 1234.56, 9999.99].map((customsValue) => ({
    id: `ad-valorem-10-${customsValue}`,
    input: { tariffCode: "0001.10", customsValue },
    estimatedDuty: Math.round(customsValue * 10) / 100
  })),
  ...[0, 1, 10, 50, 99.5, 100, 123.45, 200, 1000, 1234.5].map((quantity) => ({
    id: `specific-5-5c-${quantity}`,
    input: { tariffCode: "0001.20", quantity, quantityUnit: "kg" },
    estimatedDuty: Math.round(quantity * 5.5) / 100
  })),
  ...[
    [100, 10],
    [250, 25],
    [999.99, 1],
    [1000, 200],
    [1234.56, 321.5],
    [10000, 5],
    [0, 500],
    [500.55, 0],
    [42.42, 42],
    [7654.32, 123.45]
  ].map(([customsValue, quantity]) => ({
    id: `compound-10-plus-5-5c-${customsValue}-${quantity}`,
    input: { tariffCode: "0001.30", customsValue, quantity, quantityUnit: "kg" },
    estimatedDuty: Math.round((customsValue * 0.1 + quantity * 0.055) * 100) / 100
  })),
  ...[0, 100, 999.99, 1000].map((customsValue) => ({
    id: `mercosur-preference-${customsValue}`,
    input: { tariffCode: "0001.50", customsValue, rateColumn: "mercosur" },
    estimatedDuty: Math.round(customsValue * 5) / 100
  })),
  ...[1, 2, 10, 100].map((quantity) => ({
    id: `specific-200c-per-2kg-${quantity}`,
    input: { tariffCode: "0001.60", quantity, quantityUnit: "kg" },
    estimatedDuty: Math.round(quantity * 100) / 100
  })),
  ...[
    [100, 2],
    [999.99, 10],
    [1000, 123.45],
    [1234.56, 0],
    [7654.32, 50]
  ].map(([customsValue, quantity]) => ({
    id: `compound-7-5-plus-200c-${customsValue}-${quantity}`,
    input: { tariffCode: "0001.70", customsValue, quantity, quantityUnit: "kg" },
    estimatedDuty: Math.round((customsValue * 0.075 + quantity) * 100) / 100
  })),
  {
    id: "free-general",
    input: { tariffCode: "0001.40", customsValue: 1000 },
    estimatedDuty: 0
  },
  {
    id: "sadc-free-preference",
    input: { tariffCode: "0001.10", customsValue: 1000, preferenceClaim: { agreement: "sadc" } },
    estimatedDuty: 0,
    warningIncludes: "origin qualification"
  },
  {
    id: "formula-unresolved",
    input: { tariffCode: "0001.80", customsValue: 1000 },
    estimatedDuty: null,
    warningIncludes: "formula"
  },
  {
    id: "ambiguous-compound-unresolved",
    input: { tariffCode: "0001.90", customsValue: 1000, quantity: 1, quantityUnit: "kg" },
    estimatedDuty: null,
    warningIncludes: "not mechanically clear"
  },
  {
    id: "missing-specific-quantity-unresolved",
    input: { tariffCode: "0001.20" },
    estimatedDuty: null,
    warningIncludes: "quantity and quantityUnit"
  },
  {
    id: "specific-unit-mismatch-unresolved",
    input: { tariffCode: "0001.20", quantity: 10, quantityUnit: "l" },
    estimatedDuty: null,
    warningIncludes: "does not match"
  },
  {
    id: "missing-tariff-code-unresolved",
    input: { tariffCode: "9999.99", customsValue: 1000 },
    estimatedDuty: null,
    warningIncludes: "No tariff line"
  }
];

test("governed mechanical duty verification fixtures", () => {
  assert.equal(verificationCases.length, 50);

  for (const fixture of verificationCases) {
    const estimate = estimateCustomsDuty({
      ruleset,
      effectiveDate: "2026-07-05",
      ...fixture.input
    });

    assert.equal(estimate.estimatedDuty, fixture.estimatedDuty, fixture.id);
    if (fixture.warningIncludes) {
      assert.ok(estimate.warnings.some((warning) => warning.includes(fixture.warningIncludes)), fixture.id);
    }
  }
});
