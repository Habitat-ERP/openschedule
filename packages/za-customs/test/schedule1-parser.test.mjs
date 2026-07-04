import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSchedule1Part1Pdf,
  parseSchedule1Part1TextPages,
  Schedule1ParseResultV1Schema
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

test("exports the parse result schema", () => {
  assert.equal(
    Schedule1ParseResultV1Schema.properties.schemaVersion.const,
    "za-customs.schedule1-parse-result.v1"
  );
});

test("parses tariff rows from positioned text with continuations and warnings", () => {
  const result = parseSchedule1Part1TextPages({
    sourceDocumentSha256,
    pages: [
      page([
        item("Date: 2026-05-29", 30, 36),
        item("Heading /", 72, 39),
        item("CD", 72, 118),
        item("Article Description", 72, 142),
        item("Statistical", 72, 435),
        item("Rate of Duty", 72, 619),
        item("Subheading", 87, 39),
        item("Unit", 87, 448),
        item("General", 87, 486),
        item("EU / UK", 87, 537),
        item("EFTA", 87, 589),
        item("SADC", 87, 640),
        item("MERCOSUR", 87, 692),
        item("AfCFTA", 87, 759),
        item("00.01", 101, 39),
        item("Synthetic heading", 101, 142),
        item("only:", 115, 142),
        item("0001.1", 130, 39),
        item("-", 130, 142),
        item("Synthetic group:", 130, 176)
      ]),
      page([
        item("Date: 2026-05-29", 30, 36),
        item("Heading /", 72, 39),
        item("CD", 72, 118),
        item("Article Description", 72, 142),
        item("Statistical", 72, 435),
        item("Rate of Duty", 72, 619),
        item("Subheading", 87, 39),
        item("Unit", 87, 448),
        item("General", 87, 486),
        item("EU / UK", 87, 537),
        item("EFTA", 87, 589),
        item("SADC", 87, 640),
        item("MERCOSUR", 87, 692),
        item("AfCFTA", 87, 759),
        item("0001.10", 101, 39),
        item("7", 101, 118),
        item("--", 101, 142),
        item("Synthetic goods with a long", 101, 176),
        item("kg", 101, 448),
        item("12,5%", 101, 486),
        item("free", 101, 537),
        item("12,5%", 101, 589),
        item("free", 101, 640),
        item("12,5%", 101, 692),
        item("5%", 101, 759),
        item("description that wraps", 115, 176),
        item("0001.20", 130, 39),
        item("3", 130, 118),
        item("--", 130, 142),
        item("Goods with uncertain rate", 130, 176),
        item("kg", 130, 448),
        item("See Note 1", 130, 486),
        item("0001.30", 145, 39),
        item("4", 145, 118),
        item("--", 145, 142),
        item("Goods with specific rate", 145, 176),
        item("kg", 145, 448),
        item("5,5c/kg", 145, 486),
        item("0001.40", 160, 39),
        item("5", 160, 118),
        item("--", 160, 142),
        item("Goods with compound rate", 160, 176),
        item("kg", 160, 448),
        item("30% or 500c/2u", 160, 486),
        item("0001.50", 175, 39),
        item("6", 175, 118),
        item("--", 175, 142),
        item("Goods ( Example spp .) with qualified rate", 175, 176),
        item("kg", 175, 448),
        item("free", 175, 486),
        item("free to Exampleland", 175, 692)
      ], 2)
    ]
  });

  assert.equal(result.schemaVersion, "za-customs.schedule1-parse-result.v1");
  assert.equal(result.metrics.candidateRows, 7);
  assert.equal(result.metrics.contextRows, 2);
  assert.equal(result.metrics.rejectedRows, 0);
  assert.equal(result.tariffLines.length, 5);
  assert.equal(result.tariffLines[0].tariffCode, "0001.10");
  assert.equal(result.tariffLines[0].normalizedTariffCode, "000110");
  assert.equal(result.tariffLines[0].normalizedDescription, "Synthetic goods with a long description that wraps");
  assert.deepEqual(result.tariffLines[0].context.map((context) => context.code), ["00.01", "0001.1"]);
  assert.deepEqual(result.tariffLines[0].context.map((context) => context.normalizedDescription), [
    "Synthetic heading only",
    "Synthetic group"
  ]);
  assert.equal(result.tariffLines[0].context[0].sourceTrace[0].page, 1);
  assert.equal(result.tariffLines[0].sourceTrace[0].page, 2);
  assert.equal(result.tariffLines[0].rates.general.kind, "ad_valorem");
  assert.equal(result.tariffLines[0].rates.general.components[0].rate, 0.125);
  assert.match(result.tariffLines[0].description, /wraps$/);
  assert.match(result.tariffLines[0].sourceTrace[0].locator, /^pdfjs-dist:row=/);
  assert.ok(result.tariffLines[0].warnings.includes("Description or rate text continued across layout rows."));
  assert.equal(result.tariffLines[1].rates.general.kind, "formula");
  assert.ok(result.tariffLines[1].warnings.some((warning) => warning.includes("Unclassified general rate text")));
  assert.equal(result.tariffLines[2].rates.general.kind, "specific");
  assert.deepEqual(result.tariffLines[2].rates.general.components[0], {
    amount: 5.5,
    currency: "ZAc",
    perQuantity: 1,
    unit: "kg"
  });
  assert.equal(result.tariffLines[3].rates.general.kind, "compound");
  assert.equal(result.tariffLines[3].rates.general.components.length, 2);
  assert.equal(result.tariffLines[4].normalizedDescription, "Goods (Example spp.) with qualified rate");
  assert.equal(result.tariffLines[4].rates.mercosur.kind, "formula");
  assert.ok(result.tariffLines[4].warnings.some((warning) => warning.includes("Qualified mercosur rate text")));
});

test("optionally parses the live cached SARS PDF when OPENSCHEDULE_SARS_PDF_PATH is set", async (t) => {
  const pdfPath = process.env.OPENSCHEDULE_SARS_PDF_PATH;
  if (!pdfPath) {
    t.skip("Set OPENSCHEDULE_SARS_PDF_PATH to run the local SARS PDF parser smoke check.");
    return;
  }

  const result = await parseSchedule1Part1Pdf({ pdfPath, pages: [2, 100] });
  assert.ok(result.tariffLines.length > 10);
  assert.ok(result.tariffLines.some((line) => line.tariffCode === "1806.10.05"));
  assert.equal(result.tariffLines[0].sourceTrace[0].sourceDocumentSha256.length, 64);
});
