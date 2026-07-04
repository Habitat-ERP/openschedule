import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSchedule4RebatesPdf,
  parseSchedule4RebatesTextPages,
  Schedule4ParseResultV1Schema
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

test("exports the Schedule 4 parse result schema", () => {
  assert.equal(Schedule4ParseResultV1Schema.properties.schemaVersion.const, "za-customs.schedule4-parse-result.v1");
});

test("parses Schedule 4 rebate rows with continuations and context", () => {
  const result = parseSchedule4RebatesTextPages({
    sourceDocumentSha256,
    pages: [
      page([
        item("Date: 2026-06-12", 30, 36),
        item("SCHEDULE 4 / PART 2", 48, 36),
        item("Rebate Item", 72, 39),
        item("Tariff Heading", 72, 115),
        item("Rebate Code", 72, 180),
        item("CD", 72, 225),
        item("Description", 72, 250),
        item("Extent of Rebate", 72, 702),
        item("460.00", 96, 39),
        item("TEMPORARY REBATES OF CUSTOMS DUTIES", 96, 115),
        item("460.01", 111, 39),
        item("FISH, DAIRY PRODUCTS AND NATURAL HONEY", 111, 115),
        item("460.01", 126, 39),
        item("03.02", 126, 115),
        item("01.04", 126, 180),
        item("49", 126, 225),
        item("Mackerel, imported by specific permit", 126, 250),
        item("Full duty", 126, 702),
        item("460.01", 150, 39),
        item("03.03", 150, 115),
        item("02.04", 150, 180),
        item("43", 150, 225),
        item("Horse-mackerel, in such quantities", 150, 250),
        item("and at such times as allowed by permit", 159, 250),
        item("Full duty less 10%", 159, 702)
      ])
    ]
  });

  assert.equal(result.schemaVersion, "za-customs.schedule4-parse-result.v1");
  assert.equal(result.metrics.contextRows, 2);
  assert.equal(result.metrics.candidateRows, 2);
  assert.equal(result.metrics.rebateLines, 2);
  assert.equal(result.pageMetrics[0].rebateLines, 2);
  assert.equal(result.rebateLines.length, 2);
  assert.deepEqual(result.rebateLines[0].context.map((context) => context.rebateItem), ["460.00", "460.01"]);
  assert.equal(result.rebateLines[0].part, "2");
  assert.equal(result.rebateLines[0].rebateItem, "460.01");
  assert.equal(result.rebateLines[0].normalizedTariffHeading, "0302");
  assert.equal(result.rebateLines[0].extentOfRebate, "Full duty");
  assert.equal(result.rebateLines[1].normalizedDescription, "Horse-mackerel, in such quantities and at such times as allowed by permit");
  assert.equal(result.rebateLines[1].extentOfRebate, "Full duty less 10%");
  assert.ok(result.rebateLines[1].warnings.includes("Description or extent text continued across layout rows."));
  assert.match(result.rebateLines[1].sourceTrace[0].locator, /^pdfjs-dist:row=/);
  assert.equal(result.rebateLines[1].validFrom, "2026-06-12");
});

test("keeps Schedule 4 rows missing extent visible for QA", () => {
  const result = parseSchedule4RebatesTextPages({
    sourceDocumentSha256,
    pages: [
      page([
        item("Date: 2026-06-12", 30, 36),
        item("SCHEDULE 4 / PART 2", 48, 36),
        item("Rebate Item", 72, 39),
        item("Tariff Heading", 72, 115),
        item("Rebate Code", 72, 180),
        item("CD", 72, 225),
        item("Description", 72, 250),
        item("Extent of Rebate", 72, 702),
        item("460.01", 126, 39),
        item("03.02", 126, 115),
        item("01.04", 126, 180),
        item("49", 126, 225),
        item("Mackerel, imported by specific permit", 126, 250)
      ])
    ]
  });

  assert.equal(result.metrics.candidateRows, 1);
  assert.equal(result.rebateLines.length, 1);
  assert.equal(result.rebateLines[0].extentOfRebate, "");
  assert.ok(result.rebateLines[0].warnings.includes("Missing extent of rebate."));
  assert.ok(result.rebateLines[0].parseConfidence < 1);
});

test("optionally parses the live cached SARS Schedule 4 PDF when OPENSCHEDULE_SARS_SCHEDULE4_PDF_PATH is set", async (t) => {
  const pdfPath = process.env.OPENSCHEDULE_SARS_SCHEDULE4_PDF_PATH;
  if (!pdfPath) {
    t.skip("Set OPENSCHEDULE_SARS_SCHEDULE4_PDF_PATH to run the local SARS Schedule 4 parser smoke check.");
    return;
  }

  const result = await parseSchedule4RebatesPdf({ pdfPath, pages: [3] });
  assert.ok(result.rebateLines.length > 5);
  assert.ok(result.rebateLines.some((line) => line.rebateItem === "403.01" && line.extentOfRebate === "Full duty"));
  assert.equal(result.rebateLines[0].sourceTrace[0].sourceDocumentSha256.length, 64);
});
