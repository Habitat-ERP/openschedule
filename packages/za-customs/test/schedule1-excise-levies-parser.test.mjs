import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSchedule1ExciseLeviesPdf,
  parseSchedule1ExciseLeviesTextPages,
  Schedule1ExciseLeviesParseResultV1Schema
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

test("exports the Schedule 1 excise levies parse result schema", () => {
  assert.equal(
    Schedule1ExciseLeviesParseResultV1Schema.properties.schemaVersion.const,
    "za-customs.schedule1-excise-levies-parse-result.v1"
  );
});

test("parses Schedule 1 Part 2A excise duty rows with continuations and context", () => {
  const result = parseSchedule1ExciseLeviesTextPages({
    sourceDocumentSha256,
    pages: [
      page([
        item("Date: 2026-04-30", 30, 36),
        item("SCHEDULE 1 / PART 2A", 48, 36),
        item("Tariff Item", 72, 39),
        item("Tariff Subheading", 72, 115),
        item("Article Description", 72, 210),
        item("Rate of Excise Duty", 72, 702),
        item("104.00", 96, 39),
        item("PREPARED FOODSTUFFS; BEVERAGES, SPIRITS AND VINEGAR; TOBACCO", 96, 115),
        item("104.10", 111, 39),
        item("22.03", 111, 115),
        item("Beer made from malt:", 111, 210),
        item("104.10.10", 126, 39),
        item("2203.00.05", 126, 115),
        item("Traditional African beer as defined in Additional Note 1 to Chapter 22", 126, 210),
        item("7,82c/li", 126, 702),
        item("104.10.20", 150, 39),
        item("2203.00.90", 150, 115),
        item("Other", 150, 210),
        item("R149.98/li", 150, 702),
        item("aa", 159, 702)
      ])
    ]
  });

  assert.equal(result.schemaVersion, "za-customs.schedule1-excise-levies-parse-result.v1");
  assert.equal(result.metrics.contextRows, 2);
  assert.equal(result.metrics.candidateRows, 2);
  assert.equal(result.metrics.exciseLevyLines, 2);
  assert.equal(result.pageMetrics[0].exciseLevyLines, 2);
  assert.equal(result.exciseLevyLines.length, 2);
  assert.deepEqual(result.exciseLevyLines[0].context.map((context) => context.item), ["104.00", "104.10"]);
  assert.equal(result.exciseLevyLines[0].part, "2A");
  assert.equal(result.exciseLevyLines[0].item, "104.10.10");
  assert.equal(result.exciseLevyLines[0].normalizedTariffSubheading, "22030005");
  assert.equal(result.exciseLevyLines[0].rate.kind, "specific");
  assert.deepEqual(result.exciseLevyLines[0].rate.components[0], {
    amount: 7.82,
    currency: "ZAc",
    perQuantity: 1,
    unit: "li"
  });
  assert.deepEqual(result.exciseLevyLines[1].rate.components[0], {
    amount: 149.98,
    currency: "ZAR",
    perQuantity: 1,
    unit: "li aa"
  });
  assert.ok(result.exciseLevyLines[1].warnings.includes("Description or rate text continued across layout rows."));
  assert.match(result.exciseLevyLines[1].sourceTrace[0].locator, /^pdfjs-dist:row=/);
  assert.equal(result.exciseLevyLines[1].validFrom, "2026-04-30");
});

test("keeps Schedule 1 Part 2A rows missing rate visible for QA", () => {
  const result = parseSchedule1ExciseLeviesTextPages({
    sourceDocumentSha256,
    pages: [
      page([
        item("Date: 2026-04-30", 30, 36),
        item("SCHEDULE 1 / PART 2A", 48, 36),
        item("Tariff Item", 72, 39),
        item("Tariff Subheading", 72, 115),
        item("Article Description", 72, 210),
        item("Rate of Excise Duty", 72, 702),
        item("104.10.10", 126, 39),
        item("2203.00.05", 126, 115),
        item("Traditional African beer", 126, 210)
      ])
    ]
  });

  assert.equal(result.metrics.candidateRows, 1);
  assert.equal(result.exciseLevyLines.length, 1);
  assert.equal(result.exciseLevyLines[0].rate.kind, "unknown");
  assert.ok(result.exciseLevyLines[0].warnings.includes("Missing excise duty rate."));
  assert.ok(result.exciseLevyLines[0].parseConfidence < 1);
});

test("optionally parses the live cached SARS Schedule 1 Part 2A PDF when OPENSCHEDULE_SARS_SCHEDULE1_EXCISE_LEVIES_PDF_PATH is set", async (t) => {
  const pdfPath = process.env.OPENSCHEDULE_SARS_SCHEDULE1_EXCISE_LEVIES_PDF_PATH;
  if (!pdfPath) {
    t.skip("Set OPENSCHEDULE_SARS_SCHEDULE1_EXCISE_LEVIES_PDF_PATH to run the local SARS Schedule 1 Part 2A parser smoke check.");
    return;
  }

  const result = await parseSchedule1ExciseLeviesPdf({ pdfPath, pages: [3] });
  assert.ok(result.exciseLevyLines.length > 5);
  assert.ok(result.exciseLevyLines.some((line) => line.item === "104.10.10" && line.rate.raw === "7,82c/li"));
  assert.equal(result.exciseLevyLines[0].sourceTrace[0].sourceDocumentSha256.length, 64);
});
