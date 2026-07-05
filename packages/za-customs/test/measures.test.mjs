import assert from "node:assert/strict";
import test from "node:test";
import { listCustomsDuties, listCustomsMeasures, listCustomsReliefs } from "../dist/src/measures.js";

const sourceTrace = {
  schemaVersion: "core.source-trace.v1",
  sourceDocumentSha256: "0".repeat(64),
  page: 1,
  locator: "synthetic fixture",
  text: "synthetic source text"
};

function rate(raw = "free") {
  return { raw, kind: raw === "free" ? "free" : "ad_valorem", components: [], warnings: ["fixture rate warning"] };
}

function baseLine(overrides = {}) {
  return {
    description: "Synthetic goods",
    normalizedDescription: "Synthetic goods",
    validFrom: "2026-01-01",
    sourcePublishedDate: "2026-01-01",
    sourceImplementationDate: null,
    sourceTrace: [sourceTrace],
    parseConfidence: 1,
    warnings: ["fixture warning"],
    ...overrides
  };
}

function tariffLine(tariffCode) {
  const normalizedTariffCode = tariffCode.replace(/\D/g, "");
  return baseLine({
    schemaVersion: "za-customs.tariff-line.v1",
    tariffCode,
    normalizedTariffCode,
    context: [
      {
        code: "03.07",
        normalizedCode: "0307",
        description: "Molluscs",
        normalizedDescription: "Molluscs",
        level: 4,
        sourceTrace: [sourceTrace]
      }
    ],
    rates: { general: rate("25%") }
  });
}

const schedule5Line = baseLine({
  schemaVersion: "za-customs.schedule5-drawback-refund-line.v1",
  part: "1",
  item: "501.02",
  normalizedItem: "50102",
  tariffHeading: "03.05",
  normalizedTariffHeading: "0305",
  code: "01.04",
  normalizedCode: "0104",
  description: "Synthetic drawback goods",
  normalizedDescription: "Synthetic drawback goods",
  extentOfRefundOrDrawback: "Full duty"
});

const container = {
  schemaVersion: "za-customs.customs-ruleset-container.v1",
  manifest: {
    schemaVersion: "core.ruleset-manifest.v1",
    rulesetId: "ZA_SARS_CUSTOMS_ALL_SCHEDULES_SYNTHETIC",
    domain: "za-customs",
    country: "ZA",
    publisher: "SARS",
    generatedAt: "2026-07-05T00:00:00.000Z",
    sourceDocuments: [],
    parser: { packageName: "@openschedule/za-customs", packageVersion: "0.0.0" },
    warnings: []
  },
  schedule1Part1: {
    schemaVersion: "za-customs.schedule1-parse-result.v1",
    tariffLines: [tariffLine("0307.39.90"), tariffLine("0307.39.10")],
    warnings: [],
    metrics: {}
  },
  schedule1ExciseLevies: {
    schemaVersion: "za-customs.schedule1-excise-levies-parse-result.v1",
    exciseLevyLines: [
      baseLine({
        schemaVersion: "za-customs.schedule1-excise-levy-line.v1",
        part: "2A",
        item: "104.10.10",
        normalizedItem: "1041010",
        tariffSubheading: "2203.00.05",
        normalizedTariffSubheading: "22030005",
        rate: rate("7,82c/li")
      })
    ],
    warnings: [],
    metrics: {}
  },
  schedule2: {
    schemaVersion: "za-customs.schedule2-parse-result.v1",
    tradeRemedyLines: [
      baseLine({
        schemaVersion: "za-customs.schedule2-trade-remedy-line.v1",
        item: "201.02",
        normalizedItem: "20102",
        tariffHeading: "0207.14.9",
        normalizedTariffHeading: "0207149",
        code: "03.07",
        normalizedCode: "0307",
        rebateItems: [],
        originatingCountryOrTerritory: "Germany",
        rate: rate("73,33%")
      })
    ],
    warnings: [],
    metrics: {}
  },
  schedule5: {
    schemaVersion: "za-customs.schedule5-parse-result.v1",
    drawbackRefundLines: [schedule5Line],
    warnings: [],
    metrics: {}
  },
  schedule6: {
    schemaVersion: "za-customs.schedule6-parse-result.v1",
    exciseRebateRefundLines: [
      baseLine({
        schemaVersion: "za-customs.schedule6-excise-rebate-refund-line.v1",
        part: "1B",
        item: "619.03",
        normalizedItem: "61903",
        tariffItem: "104.10.20",
        normalizedTariffItem: "1041020",
        rebateCode: "01.01",
        normalizedRebateCode: "0101",
        extentOfRebate: "",
        extentOfRefund: "Full duty"
      })
    ],
    warnings: [],
    metrics: {}
  }
};

test("lists customs measures with normalized exact and prefix filters", () => {
  const exact = listCustomsMeasures(container, { tariffCode: "0307.39.10" });
  const prefix = listCustomsMeasures(container, { tariffPrefix: "0307.39" });
  const drawback = listCustomsReliefs(container, { item: "501.02", code: "01.04" });

  assert.equal(exact.items.length, 1);
  assert.equal(exact.items[0].normalizedTariffCode, "03073910");
  assert.equal("confidence" in exact.items[0], false);
  assert.equal("warnings" in exact.items[0], false);
  assert.equal("sourceTrace" in exact.items[0], false);
  assert.equal(exact.items[0].metadata, undefined);
  assert.equal("warnings" in exact.items[0].rates.general, false);
  assert.equal(exact.items[0].rates.general.metadata, undefined);

  const rich = listCustomsMeasures(container, { tariffCode: "0307.39.10", includeMetadata: true });
  assert.equal(rich.items[0].metadata.confidence, 1);
  assert.deepEqual(rich.items[0].metadata.warnings, ["fixture warning"]);
  assert.deepEqual(rich.items[0].rates.general.metadata.warnings, ["fixture rate warning"]);
  assert.deepEqual(prefix.items.map((item) => item.normalizedTariffCode), ["03073910", "03073990"]);
  assert.equal(drawback.items.length, 1);
  assert.equal(drawback.items[0].kind, "drawback-or-refund");
  assert.equal(drawback.items[0].extent, "Full duty");
});

test("splits duties from reliefs and paginates by sorted id cursor", () => {
  const duties = listCustomsDuties(container, { limit: 500 });
  const reliefs = listCustomsReliefs(container, { limit: 500 });
  const first = listCustomsMeasures(container, { limit: 2 });
  const second = listCustomsMeasures(container, { limit: 500, cursor: first.nextCursor });

  assert.deepEqual(new Set(duties.items.map((item) => item.kind)), new Set(["ordinary-duty", "excise-levy", "trade-remedy"]));
  assert.deepEqual(new Set(reliefs.items.map((item) => item.kind)), new Set(["drawback-or-refund", "refund"]));
  assert.equal(first.items.length, 2);
  assert.equal(first.nextCursor, first.items.at(-1).id);
  assert.ok(second.items.every((item) => item.id > first.nextCursor));
});

test("filters schedule, origin, tariff item, and effective date", () => {
  assert.equal(listCustomsDuties(container, { origin: "Germany" }).items[0].kind, "trade-remedy");
  assert.equal(listCustomsMeasures(container, { schedule: "1" }).items.length, 3);
  assert.equal(listCustomsMeasures(container, { tariffItem: "104.10.20", kind: "refund" }).items[0].schedule, "6");
  assert.equal(listCustomsMeasures(container, { tariffCode: "0307.39.10", effectiveDate: "2025-12-31" }).items.length, 0);
});
