import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSchedule6ExciseRebatesRefundsPdf,
  parseSchedule6ExciseRebatesRefundsTextPages,
  Schedule6ParseResultV1Schema
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

test("exports the Schedule 6 parse result schema", () => {
  assert.equal(Schedule6ParseResultV1Schema.properties.schemaVersion.const, "za-customs.schedule6-parse-result.v1");
});

test("parses Schedule 6 excise rebate and refund rows with continuations and context", () => {
  const result = parseSchedule6ExciseRebatesRefundsTextPages({
    sourceDocumentSha256,
    pages: [
      page([
        item("Date: 2026-07-01", 30, 36),
        item("SCHEDULE 6 / PART 1B", 48, 36),
        item("Rebate Item", 72, 39),
        item("Tariff Item", 72, 96),
        item("Rebate Code", 72, 153),
        item("CD", 72, 215),
        item("Description", 72, 238),
        item("Extent of Rebate", 72, 581),
        item("Extent of Refund", 72, 695),
        item("619.00", 96, 39),
        item("BEER MADE FROM MALT AND TRADITIONAL AFRICAN BEER", 96, 96),
        item("619.01", 111, 39),
        item("104.10.10", 111, 96),
        item("01.01", 111, 153),
        item("76", 111, 215),
        item("Traditional African Beer as defined in Additional Note 1 to Chapter 22", 111, 238),
        item("Full duty", 111, 581),
        item("619.03", 135, 39),
        item("104.10.20", 135, 96),
        item("01.01", 135, 153),
        item("78", 135, 215),
        item("Beer made from malt returned to a customs and excise manufacturing", 135, 238),
        item("warehouse for destruction", 144, 238),
        item("Full duty", 144, 695)
      ])
    ]
  });

  assert.equal(result.schemaVersion, "za-customs.schedule6-parse-result.v1");
  assert.equal(result.metrics.contextRows, 1);
  assert.equal(result.metrics.candidateRows, 2);
  assert.equal(result.metrics.exciseRebateRefundLines, 2);
  assert.equal(result.pageMetrics[0].exciseRebateRefundLines, 2);
  assert.equal(result.exciseRebateRefundLines.length, 2);
  assert.deepEqual(result.exciseRebateRefundLines[0].context.map((context) => context.item), ["619.00"]);
  assert.equal(result.exciseRebateRefundLines[0].part, "1B");
  assert.equal(result.exciseRebateRefundLines[0].item, "619.01");
  assert.equal(result.exciseRebateRefundLines[0].normalizedTariffItem, "1041010");
  assert.equal(result.exciseRebateRefundLines[0].extentOfRebate, "Full duty");
  assert.equal(result.exciseRebateRefundLines[0].extentOfRefund, "");
  assert.equal(
    result.exciseRebateRefundLines[1].normalizedDescription,
    "Beer made from malt returned to a customs and excise manufacturing warehouse for destruction"
  );
  assert.equal(result.exciseRebateRefundLines[1].extentOfRebate, "");
  assert.equal(result.exciseRebateRefundLines[1].extentOfRefund, "Full duty");
  assert.ok(result.exciseRebateRefundLines[1].warnings.includes("Description or extent text continued across layout rows."));
  assert.match(result.exciseRebateRefundLines[1].sourceTrace[0].locator, /^pdfjs-dist:row=/);
  assert.equal(result.exciseRebateRefundLines[1].validFrom, "2026-07-01");
});

test("optionally parses the live cached SARS Schedule 6 PDF when OPENSCHEDULE_SARS_SCHEDULE6_PDF_PATH is set", async (t) => {
  const pdfPath = process.env.OPENSCHEDULE_SARS_SCHEDULE6_PDF_PATH;
  if (!pdfPath) {
    t.skip("Set OPENSCHEDULE_SARS_SCHEDULE6_PDF_PATH to run the local SARS Schedule 6 parser smoke check.");
    return;
  }

  const result = await parseSchedule6ExciseRebatesRefundsPdf({ pdfPath, pages: [4] });
  assert.ok(result.exciseRebateRefundLines.length > 4);
  assert.ok(result.exciseRebateRefundLines.some((line) => line.item === "618.01" && line.extentOfRebate === "Full duty"));
  assert.equal(result.exciseRebateRefundLines[0].sourceTrace[0].sourceDocumentSha256.length, 64);
});
