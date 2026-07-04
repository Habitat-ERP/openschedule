import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSchedule5DrawbacksRefundsPdf,
  parseSchedule5DrawbacksRefundsTextPages,
  Schedule5ParseResultV1Schema
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

test("exports the Schedule 5 parse result schema", () => {
  assert.equal(Schedule5ParseResultV1Schema.properties.schemaVersion.const, "za-customs.schedule5-parse-result.v1");
});

test("parses Schedule 5 drawback and refund rows with continuations and context", () => {
  const result = parseSchedule5DrawbacksRefundsTextPages({
    sourceDocumentSha256,
    pages: [
      page([
        item("Date: 2026-01-01", 30, 36),
        item("SCHEDULE 5 / PART 1", 48, 36),
        item("Drawback Item", 72, 39),
        item("Tariff Heading", 72, 115),
        item("Code", 72, 180),
        item("CD", 72, 225),
        item("Description", 72, 250),
        item("Extent of Drawback", 72, 702),
        item("501.00", 96, 39),
        item("ANIMALS AND ANIMAL PRODUCTS", 96, 115),
        item("501.02", 111, 39),
        item("FISH AND FISH PRODUCTS", 111, 115),
        item("501.02", 126, 39),
        item("03.05", 126, 115),
        item("01.04", 126, 180),
        item("43", 126, 225),
        item("Salted fish, used in the manufacture of dried fish", 126, 250),
        item("Full duty", 126, 702),
        item("501.02", 150, 39),
        item("48.19", 150, 115),
        item("01.04", 150, 180),
        item("42", 150, 225),
        item("Containers of printed paper or paperboard", 150, 250),
        item("used for packing frozen fish products", 159, 250),
        item("Full duty less 5%", 159, 702)
      ])
    ]
  });

  assert.equal(result.schemaVersion, "za-customs.schedule5-parse-result.v1");
  assert.equal(result.metrics.contextRows, 2);
  assert.equal(result.metrics.candidateRows, 2);
  assert.equal(result.metrics.drawbackRefundLines, 2);
  assert.equal(result.pageMetrics[0].drawbackRefundLines, 2);
  assert.equal(result.drawbackRefundLines.length, 2);
  assert.deepEqual(result.drawbackRefundLines[0].context.map((context) => context.item), ["501.00", "501.02"]);
  assert.equal(result.drawbackRefundLines[0].part, "1");
  assert.equal(result.drawbackRefundLines[0].item, "501.02");
  assert.equal(result.drawbackRefundLines[0].normalizedTariffHeading, "0305");
  assert.equal(result.drawbackRefundLines[0].extentOfRefundOrDrawback, "Full duty");
  assert.equal(
    result.drawbackRefundLines[1].normalizedDescription,
    "Containers of printed paper or paperboard used for packing frozen fish products"
  );
  assert.equal(result.drawbackRefundLines[1].extentOfRefundOrDrawback, "Full duty less 5%");
  assert.ok(result.drawbackRefundLines[1].warnings.includes("Description or extent text continued across layout rows."));
  assert.match(result.drawbackRefundLines[1].sourceTrace[0].locator, /^pdfjs-dist:row=/);
  assert.equal(result.drawbackRefundLines[1].validFrom, "2026-01-01");
});

test("optionally parses the live cached SARS Schedule 5 PDF when OPENSCHEDULE_SARS_SCHEDULE5_PDF_PATH is set", async (t) => {
  const pdfPath = process.env.OPENSCHEDULE_SARS_SCHEDULE5_PDF_PATH;
  if (!pdfPath) {
    t.skip("Set OPENSCHEDULE_SARS_SCHEDULE5_PDF_PATH to run the local SARS Schedule 5 parser smoke check.");
    return;
  }

  const result = await parseSchedule5DrawbacksRefundsPdf({ pdfPath, pages: [4] });
  assert.ok(result.drawbackRefundLines.length > 5);
  assert.ok(result.drawbackRefundLines.some((line) => line.item === "501.02" && line.extentOfRefundOrDrawback === "Full duty"));
  assert.equal(result.drawbackRefundLines[0].sourceTrace[0].sourceDocumentSha256.length, 64);
});
