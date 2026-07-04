import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSchedule3IndustrialRebatesPdf,
  parseSchedule3IndustrialRebatesTextPages,
  Schedule3ParseResultV1Schema
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

test("exports the Schedule 3 parse result schema", () => {
  assert.equal(Schedule3ParseResultV1Schema.properties.schemaVersion.const, "za-customs.schedule3-parse-result.v1");
});

test("parses Schedule 3 industrial rebate rows with continuations and context", () => {
  const result = parseSchedule3IndustrialRebatesTextPages({
    sourceDocumentSha256,
    pages: [
      page([
        item("Date: 2026-01-25", 30, 36),
        item("SCHEDULE 3 / PART 1", 48, 36),
        item("Rebate Item", 72, 39),
        item("Tariff Heading", 72, 115),
        item("Rebate Code", 72, 180),
        item("CD", 72, 225),
        item("Description", 72, 250),
        item("Extent of Rebate", 72, 702),
        item("303.00", 96, 39),
        item("ANIMAL AND VEGETABLE FATS AND OILS", 96, 115),
        item("303.01", 111, 39),
        item("INDUSTRY: ANIMAL OR VEGETABLE FATS AND OILS", 111, 115),
        item("303.01", 126, 39),
        item("1511.90", 126, 115),
        item("01.06", 126, 180),
        item("62", 126, 225),
        item("Palm stearin, not chemically modified", 126, 250),
        item("Full duty", 126, 702),
        item("303.01", 150, 39),
        item("1511.90", 150, 115),
        item("02.06", 150, 180),
        item("67", 150, 225),
        item("Palm stearin, refined but not chemically modified,", 150, 250),
        item("for blending with paraffin wax", 159, 250),
        item("Full duty less 6%", 159, 702)
      ])
    ]
  });

  assert.equal(result.schemaVersion, "za-customs.schedule3-parse-result.v1");
  assert.equal(result.metrics.contextRows, 2);
  assert.equal(result.metrics.candidateRows, 2);
  assert.equal(result.metrics.rebateLines, 2);
  assert.equal(result.pageMetrics[0].rebateLines, 2);
  assert.equal(result.rebateLines.length, 2);
  assert.deepEqual(result.rebateLines[0].context.map((context) => context.rebateItem), ["303.00", "303.01"]);
  assert.equal(result.rebateLines[0].part, "1");
  assert.equal(result.rebateLines[0].rebateItem, "303.01");
  assert.equal(result.rebateLines[0].normalizedTariffHeading, "151190");
  assert.equal(result.rebateLines[0].extentOfRebate, "Full duty");
  assert.equal(result.rebateLines[1].normalizedDescription, "Palm stearin, refined but not chemically modified, for blending with paraffin wax");
  assert.equal(result.rebateLines[1].extentOfRebate, "Full duty less 6%");
  assert.ok(result.rebateLines[1].warnings.includes("Description or extent text continued across layout rows."));
  assert.match(result.rebateLines[1].sourceTrace[0].locator, /^pdfjs-dist:row=/);
  assert.equal(result.rebateLines[1].validFrom, "2026-01-25");
});

test("keeps Schedule 3 rows missing extent visible for QA", () => {
  const result = parseSchedule3IndustrialRebatesTextPages({
    sourceDocumentSha256,
    pages: [
      page([
        item("Date: 2026-01-25", 30, 36),
        item("SCHEDULE 3 / PART 1", 48, 36),
        item("Rebate Item", 72, 39),
        item("Tariff Heading", 72, 115),
        item("Rebate Code", 72, 180),
        item("CD", 72, 225),
        item("Description", 72, 250),
        item("Extent of Rebate", 72, 702),
        item("303.01", 126, 39),
        item("1511.90", 126, 115),
        item("01.06", 126, 180),
        item("62", 126, 225),
        item("Palm stearin, not chemically modified", 126, 250)
      ])
    ]
  });

  assert.equal(result.metrics.candidateRows, 1);
  assert.equal(result.rebateLines.length, 1);
  assert.equal(result.rebateLines[0].extentOfRebate, "");
  assert.ok(result.rebateLines[0].warnings.includes("Missing extent of rebate."));
  assert.ok(result.rebateLines[0].parseConfidence < 1);
});

test("optionally parses the live cached SARS Schedule 3 PDF when OPENSCHEDULE_SARS_SCHEDULE3_PDF_PATH is set", async (t) => {
  const pdfPath = process.env.OPENSCHEDULE_SARS_SCHEDULE3_PDF_PATH;
  if (!pdfPath) {
    t.skip("Set OPENSCHEDULE_SARS_SCHEDULE3_PDF_PATH to run the local SARS Schedule 3 parser smoke check.");
    return;
  }

  const result = await parseSchedule3IndustrialRebatesPdf({ pdfPath, pages: [3] });
  assert.ok(result.rebateLines.length > 5);
  assert.ok(result.rebateLines.some((line) => line.rebateItem === "303.01" && line.extentOfRebate === "Full duty"));
  assert.equal(result.rebateLines[0].sourceTrace[0].sourceDocumentSha256.length, 64);
});
