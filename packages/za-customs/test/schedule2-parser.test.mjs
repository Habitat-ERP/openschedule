import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSchedule2TradeRemediesPdf,
  parseSchedule2TradeRemediesTextPages,
  Schedule2ParseResultV1Schema
} from "../dist/src/index.js";

const sourceDocumentSha256 = "0".repeat(64);

function item(text, row, column) {
  return { text, x: row, y: column, width: Math.max(1, text.length * 4), height: 8 };
}

function page(items, pageNumber = 1) {
  return {
    pageNumber,
    width: 595,
    height: 842,
    rotation: 90,
    items
  };
}

test("exports the Schedule 2 parse result schema", () => {
  assert.equal(Schedule2ParseResultV1Schema.properties.schemaVersion.const, "za-customs.schedule2-parse-result.v1");
});

test("parses Schedule 2 trade remedy rows with continuations and context", () => {
  const result = parseSchedule2TradeRemediesTextPages({
    sourceDocumentSha256,
    pages: [
      page([
        item("Date: 2026-06-12", 30, 36),
        item("Item", 72, 39),
        item("Tariff Heading", 72, 82),
        item("Code", 72, 146),
        item("CD", 72, 190),
        item("Description", 72, 210),
        item("Rebate Items", 72, 531),
        item("Imported from or", 72, 617),
        item("Rate of Anti-dumping", 72, 702),
        item("201.00", 96, 39),
        item("LIVE ANIMALS; ANIMAL PRODUCTS", 96, 82),
        item("201.02", 111, 39),
        item("MEAT AND EDIBLE MEAT OFFAL", 111, 82),
        item("201.02", 126, 39),
        item("0207.14.9", 126, 82),
        item("03.07", 126, 146),
        item("70", 126, 190),
        item("Frozen meat of fowls", 126, 210),
        item("301.00-399.00;", 126, 531),
        item("Germany", 126, 617),
        item("73,33%", 126, 702),
        item("201.02", 150, 39),
        item("0207.14.91", 150, 82),
        item("01.08", 150, 146),
        item("89", 150, 190),
        item("Whole bird cut in half", 150, 210),
        item("301.00-399.00;", 150, 531),
        item("United States of", 150, 617),
        item("940c/kg", 150, 702),
        item("401.00-499.00", 159, 531),
        item("America", 159, 617)
      ])
    ]
  });

  assert.equal(result.schemaVersion, "za-customs.schedule2-parse-result.v1");
  assert.equal(result.metrics.contextRows, 2);
  assert.equal(result.metrics.candidateRows, 2);
  assert.equal(result.metrics.tradeRemedyLines, 2);
  assert.equal(result.pageMetrics[0].tradeRemedyLines, 2);
  assert.equal(result.tradeRemedyLines.length, 2);
  assert.deepEqual(result.tradeRemedyLines[0].context.map((context) => context.item), ["201.00", "201.02"]);
  assert.equal(result.tradeRemedyLines[0].normalizedDescription, "Frozen meat of fowls");
  assert.equal(result.tradeRemedyLines[0].rate.kind, "ad_valorem");
  assert.equal(result.tradeRemedyLines[0].rate.components[0].rate, 0.7333);
  assert.equal(result.tradeRemedyLines[1].originatingCountryOrTerritory, "United States of America");
  assert.deepEqual(result.tradeRemedyLines[1].rebateItems, ["301.00-399.00", "401.00-499.00"]);
  assert.equal(result.tradeRemedyLines[1].rate.kind, "specific");
  assert.deepEqual(result.tradeRemedyLines[1].rate.components[0], {
    amount: 940,
    currency: "ZAc",
    perQuantity: 1,
    unit: "kg"
  });
  assert.ok(result.tradeRemedyLines[1].warnings.includes("Description or column text continued across layout rows."));
  assert.match(result.tradeRemedyLines[1].sourceTrace[0].locator, /^pdfjs-dist:row=/);
  assert.equal(result.tradeRemedyLines[1].validFrom, "2026-06-12");
});

test("keeps Schedule 2 rows missing origin and rate visible for QA", () => {
  const result = parseSchedule2TradeRemediesTextPages({
    sourceDocumentSha256,
    pages: [
      page([
        item("Date: 2026-06-12", 30, 36),
        item("Item", 72, 39),
        item("Tariff Heading", 72, 82),
        item("Code", 72, 146),
        item("CD", 72, 190),
        item("Description", 72, 210),
        item("Imported from or", 72, 617),
        item("Rate of Anti-dumping", 72, 702),
        item("201.02", 126, 39),
        item("0207.14.9", 126, 82),
        item("03.07", 126, 146),
        item("70", 126, 190),
        item("Frozen meat of fowls", 126, 210)
      ])
    ]
  });

  assert.equal(result.metrics.candidateRows, 1);
  assert.equal(result.tradeRemedyLines.length, 1);
  assert.equal(result.tradeRemedyLines[0].originatingCountryOrTerritory, "");
  assert.equal(result.tradeRemedyLines[0].rate.kind, "unknown");
  assert.ok(result.tradeRemedyLines[0].warnings.includes("Missing originating country or territory."));
  assert.ok(result.tradeRemedyLines[0].warnings.includes("Missing anti-dumping duty rate."));
  assert.ok(result.tradeRemedyLines[0].parseConfidence < 1);
});

test("optionally parses the live cached SARS Schedule 2 PDF when OPENSCHEDULE_SARS_SCHEDULE2_PDF_PATH is set", async (t) => {
  const pdfPath = process.env.OPENSCHEDULE_SARS_SCHEDULE2_PDF_PATH;
  if (!pdfPath) {
    t.skip("Set OPENSCHEDULE_SARS_SCHEDULE2_PDF_PATH to run the local SARS Schedule 2 parser smoke check.");
    return;
  }

  const result = await parseSchedule2TradeRemediesPdf({ pdfPath, pages: [3] });
  assert.ok(result.tradeRemedyLines.length > 5);
  assert.ok(result.tradeRemedyLines.some((line) => line.item === "201.02" && line.originatingCountryOrTerritory === "Germany"));
  assert.equal(result.tradeRemedyLines[0].sourceTrace[0].sourceDocumentSha256.length, 64);
});
