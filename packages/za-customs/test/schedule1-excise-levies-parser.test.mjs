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

test("parses Schedule 1 Part 2B ad valorem excise duty rows", () => {
  const result = parseSchedule1ExciseLeviesTextPages({
    sourceDocumentSha256,
    pages: [
      page([
        item("Date: 2025-04-01", 30, 36),
        item("SCHEDULE 1 / PART 2B", 48, 36),
        item("Tariff Item", 72, 39),
        item("Tariff Subheading", 72, 115),
        item("Article Description", 72, 210),
        item("Rate of Excise Duty", 72, 702),
        item("118.15", 96, 39),
        item("33.03", 96, 115),
        item("Perfumes and toilet waters:", 96, 210),
        item("118.15.01", 126, 39),
        item("3303.00.90", 126, 115),
        item("Other", 126, 210),
        item("9%", 126, 702),
        item("124.37.11", 150, 39),
        item("8517.62.20", 150, 115),
        item("Apparatus designed for use when carried in the hand or on the person", 150, 210),
        item("(excluding two-way radios), with a value for duty purposes exceeding", 159, 210),
        item("R2 500", 168, 210),
        item("9%", 168, 702)
      ])
    ]
  });

  assert.equal(result.metrics.contextRows, 1);
  assert.equal(result.metrics.candidateRows, 2);
  assert.equal(result.metrics.exciseLevyLines, 2);
  assert.equal(result.exciseLevyLines[0].part, "2B");
  assert.equal(result.exciseLevyLines[0].item, "118.15.01");
  assert.equal(result.exciseLevyLines[0].rate.kind, "ad_valorem");
  assert.equal(result.exciseLevyLines[0].rate.components[0].rate, 0.09);
  assert.equal(
    result.exciseLevyLines[1].normalizedDescription,
    "Apparatus designed for use when carried in the hand or on the person (excluding two-way radios), with a value for duty purposes exceeding R2 500"
  );
  assert.ok(result.exciseLevyLines[1].warnings.includes("Description or rate text continued across layout rows."));
  assert.equal(result.exciseLevyLines[1].validFrom, "2025-04-01");
});

test("parses Schedule 1 Part 3A environmental levy rows", () => {
  const result = parseSchedule1ExciseLeviesTextPages({
    sourceDocumentSha256,
    pages: [
      page([
        item("Date: 2024-04-01", 30, 36),
        item("SCHEDULE 1 / PART 3A", 48, 36),
        item("Environmental", 72, 39),
        item("Tariff Heading", 72, 115),
        item("Article Description", 72, 210),
        item("Rate of", 72, 702),
        item("Levy Item", 87, 39),
        item("Environmental Levy", 87, 702),
        item("147.00", 96, 39),
        item("ARTICLES FOR THE CONVEYANCE OR PACKING OF GOODS, OF PLASTICS", 96, 115),
        item("147.01", 111, 39),
        item("3923.2", 111, 115),
        item("Sacks and bags (including cones):", 111, 210),
        item("147.01.01", 126, 39),
        item("3923.21.07", 126, 115),
        item("Carrier bags, with a thickness of 24 microns or more", 126, 210),
        item("32c/bag", 126, 702),
        item("147.01.03", 150, 39),
        item("3923.21.17", 150, 115),
        item("Flat bags, with a thickness of 24 microns or more", 150, 210),
        item("(excluding immediate packings, zip-lock bags and household bags)", 159, 210),
        item("32c/bag", 159, 702)
      ])
    ]
  });

  assert.equal(result.metrics.contextRows, 2);
  assert.equal(result.metrics.candidateRows, 2);
  assert.equal(result.metrics.exciseLevyLines, 2);
  assert.equal(result.metrics.rejectedRows, 0);
  assert.equal(result.exciseLevyLines[0].part, "3A");
  assert.equal(result.exciseLevyLines[0].item, "147.01.01");
  assert.equal(result.exciseLevyLines[0].normalizedTariffSubheading, "39232107");
  assert.equal(result.exciseLevyLines[0].rate.kind, "specific");
  assert.deepEqual(result.exciseLevyLines[0].rate.components[0], {
    amount: 32,
    currency: "ZAc",
    perQuantity: 1,
    unit: "bag"
  });
  assert.equal(
    result.exciseLevyLines[1].normalizedDescription,
    "Flat bags, with a thickness of 24 microns or more (excluding immediate packings, zip-lock bags and household bags)"
  );
  assert.ok(result.exciseLevyLines[1].warnings.includes("Description or rate text continued across layout rows."));
  assert.equal(result.exciseLevyLines[1].validFrom, "2024-04-01");
});

test("parses Schedule 1 Part 3B electricity levy rows", () => {
  const result = parseSchedule1ExciseLeviesTextPages({
    sourceDocumentSha256,
    pages: [
      page([
        item("Date: 2012-07-01", 30, 36),
        item("SCHEDULE 1 / PART 3B", 48, 36),
        item("Electricity", 72, 39),
        item("Tariff Heading", 72, 115),
        item("Article Description", 72, 210),
        item("Rate of", 72, 702),
        item("Levy Item", 87, 39),
        item("Electricity Levy", 87, 702),
        item("148.00", 102, 39),
        item("ELECTRICAL ENERGY", 102, 115),
        item("148.01.01", 117, 39),
        item("2716.00", 117, 115),
        item("Electricity generated in the Republic, subject to the Notes hereto", 117, 210),
        item("3,5c/kW.h", 117, 702)
      ])
    ]
  });

  assert.equal(result.metrics.contextRows, 1);
  assert.equal(result.metrics.candidateRows, 1);
  assert.equal(result.metrics.exciseLevyLines, 1);
  assert.equal(result.metrics.rejectedRows, 0);
  assert.equal(result.exciseLevyLines[0].part, "3B");
  assert.equal(result.exciseLevyLines[0].item, "148.01.01");
  assert.equal(result.exciseLevyLines[0].normalizedTariffSubheading, "271600");
  assert.equal(result.exciseLevyLines[0].rate.kind, "specific");
  assert.deepEqual(result.exciseLevyLines[0].rate.components[0], {
    amount: 3.5,
    currency: "ZAc",
    perQuantity: 1,
    unit: "kW.h"
  });
  assert.equal(result.exciseLevyLines[0].validFrom, "2012-07-01");
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

test("optionally parses the live cached SARS Schedule 1 Part 2B PDF when OPENSCHEDULE_SARS_SCHEDULE1_PART2B_PDF_PATH is set", async (t) => {
  const pdfPath = process.env.OPENSCHEDULE_SARS_SCHEDULE1_PART2B_PDF_PATH;
  if (!pdfPath) {
    t.skip("Set OPENSCHEDULE_SARS_SCHEDULE1_PART2B_PDF_PATH to run the local SARS Schedule 1 Part 2B parser smoke check.");
    return;
  }

  const result = await parseSchedule1ExciseLeviesPdf({ pdfPath, pages: [3] });
  assert.ok(result.exciseLevyLines.length > 5);
  assert.ok(result.exciseLevyLines.some((line) => line.item === "118.15.01" && line.rate.raw === "9%"));
  assert.equal(result.exciseLevyLines[0].sourceTrace[0].sourceDocumentSha256.length, 64);
});

test("optionally parses the live cached SARS Schedule 1 Part 3A PDF when OPENSCHEDULE_SARS_SCHEDULE1_PART3A_PDF_PATH is set", async (t) => {
  const pdfPath = process.env.OPENSCHEDULE_SARS_SCHEDULE1_PART3A_PDF_PATH;
  if (!pdfPath) {
    t.skip("Set OPENSCHEDULE_SARS_SCHEDULE1_PART3A_PDF_PATH to run the local SARS Schedule 1 Part 3A parser smoke check.");
    return;
  }

  const result = await parseSchedule1ExciseLeviesPdf({ pdfPath, pages: [3] });
  assert.ok(result.exciseLevyLines.length > 2);
  assert.ok(result.exciseLevyLines.some((line) => line.item === "147.01.01" && line.rate.raw === "32c/bag"));
  assert.equal(result.exciseLevyLines[0].sourceTrace[0].sourceDocumentSha256.length, 64);
});

test("optionally parses the live cached SARS Schedule 1 Part 3B PDF when OPENSCHEDULE_SARS_SCHEDULE1_PART3B_PDF_PATH is set", async (t) => {
  const pdfPath = process.env.OPENSCHEDULE_SARS_SCHEDULE1_PART3B_PDF_PATH;
  if (!pdfPath) {
    t.skip("Set OPENSCHEDULE_SARS_SCHEDULE1_PART3B_PDF_PATH to run the local SARS Schedule 1 Part 3B parser smoke check.");
    return;
  }

  const result = await parseSchedule1ExciseLeviesPdf({ pdfPath, pages: [3] });
  assert.ok(result.exciseLevyLines.length > 0);
  assert.ok(result.exciseLevyLines.some((line) => line.item === "148.01.01" && line.rate.raw === "3,5c/kW.h"));
  assert.equal(result.exciseLevyLines[0].sourceTrace[0].sourceDocumentSha256.length, 64);
});
