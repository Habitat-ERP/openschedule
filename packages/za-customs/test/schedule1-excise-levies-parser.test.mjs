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

const remainingSchedule1ExciseLevyCases = [
  {
    part: "3C",
    name: "electric filament lamps",
    items: [
      item("Date: 2024-04-01", 30, 36),
      item("SCHEDULE 1 / PART 3C", 48, 36),
      item("Environmental", 72, 39),
      item("Tariff Heading", 72, 115),
      item("Article Description", 72, 210),
      item("Rate of", 72, 702),
      item("Levy Item", 87, 39),
      item("Environmental Levy", 87, 702),
      item("149.00", 102, 39),
      item("ELECTRIC FILAMENT LAMPS", 102, 115),
      item("149.01", 117, 39),
      item("8539.21", 117, 115),
      item("Tungsten halogen:", 117, 210),
      item("149.01.05", 132, 39),
      item("8539.21.45", 132, 115),
      item("Other, of a power of 15 W or more", 132, 210),
      item("R20.00/lamp", 132, 702)
    ],
    expected: {
      item: "149.01.05",
      tariffSubheading: "8539.21.45",
      rateRaw: "R20.00/lamp",
      rateKind: "specific",
      component: { amount: 20, currency: "ZAR", perQuantity: 1, unit: "lamp" }
    }
  },
  {
    part: "3D",
    name: "vehicle carbon dioxide emissions",
    items: [
      item("Date: 2024-04-01", 30, 36),
      item("SCHEDULE 1 / PART 3D", 48, 36),
      item("Environmental", 72, 39),
      item("Tariff", 72, 115),
      item("Article Description", 72, 210),
      item("Rate of", 72, 702),
      item("Levy Item", 87, 39),
      item("Subheading", 87, 115),
      item("Environmental Levy", 87, 702),
      item("151.00", 102, 39),
      item("MOTOR VEHICLES", 102, 115),
      item("151.01", 117, 39),
      item("87.03", 117, 115),
      item("Motor cars and other motor vehicles:", 117, 210),
      item("151.01.09", 132, 39),
      item("8703.21.90", 132, 115),
      item("Other", 132, 210),
      item("R146.00 per g/km CO", 132, 702),
      item("emissions", 132, 764),
      item("2", 136, 758),
      item("exceeding 95g/km", 141, 702)
    ],
    expected: {
      item: "151.01.09",
      tariffSubheading: "8703.21.90",
      rateRaw: "R146.00 per g/km CO emissions 2 exceeding 95g/km",
      rateKind: "specific",
      component: { amount: 146, currency: "ZAR", perQuantity: 1, unit: "g/km CO emissions 2 exceeding 95g/km" }
    }
  },
  {
    part: "3E",
    name: "tyres",
    items: [
      item("Date: 2022-06-17", 30, 36),
      item("SCHEDULE 1 / PART 3E", 48, 36),
      item("Environmental", 72, 39),
      item("Tariff", 72, 115),
      item("Article Description", 72, 210),
      item("Rate of", 72, 702),
      item("Levy Item", 87, 39),
      item("Subheading", 87, 115),
      item("Environmental Levy", 87, 702),
      item("152.00", 102, 39),
      item("40.11", 102, 115),
      item("New pneumatic tyres, of rubber:", 102, 210),
      item("152.01.01", 132, 39),
      item("4011.10.01", 132, 115),
      item("Having a rim size not exceeding 33 cm (13 inches)", 132, 210),
      item("R2.30/kg net", 132, 702)
    ],
    expected: {
      item: "152.01.01",
      tariffSubheading: "4011.10.01",
      rateRaw: "R2.30/kg net",
      rateKind: "specific",
      component: { amount: 2.3, currency: "ZAR", perQuantity: 1, unit: "kg net" }
    }
  },
  {
    part: "3F",
    name: "carbon emissions",
    items: [
      item("Date: 2026-03-27", 30, 36),
      item("SCHEDULE 1 / PART 3F", 48, 36),
      item("Environmental", 72, 39),
      item("Tariff", 72, 115),
      item("Article Description", 72, 210),
      item("Rate of", 72, 702),
      item("Levy Item", 87, 39),
      item("Subheading", 87, 115),
      item("Environmental Levy", 87, 702),
      item("157.00", 102, 39),
      item("9903.00", 102, 115),
      item("Carbon emissions, resulting from:", 102, 210),
      item("157.01", 117, 39),
      item("9903.00.10", 117, 115),
      item("Fuel combustion", 117, 210),
      item("R308.00 /t CO", 117, 702),
      item("e emissions", 117, 735),
      item("2", 121, 732)
    ],
    expected: {
      item: "157.01",
      tariffSubheading: "9903.00.10",
      rateRaw: "R308.00 /t CO e emissions 2",
      rateKind: "specific",
      component: { amount: 308, currency: "ZAR", perQuantity: 1, unit: "t CO e emissions 2" }
    }
  },
  {
    part: "5A",
    name: "fuel levy",
    items: [
      item("Date: 2026-07-01", 30, 36),
      item("SCHEDULE 1 / PART 5A", 48, 36),
      item("Fuel", 72, 39),
      item("Tariff Heading", 72, 128),
      item("Article Description", 72, 217),
      item("Rate of", 72, 691),
      item("Levy Item", 87, 39),
      item("Fuel Levy", 87, 691),
      item("195.00", 102, 39),
      item("FUELS", 102, 128),
      item("195.10.03", 132, 39),
      item("2710.12.02", 132, 128),
      item("Petrol, as defined in Additional Note 1(b) to Chapter 27", 132, 217),
      item("429c/li", 132, 691)
    ],
    expected: {
      item: "195.10.03",
      tariffSubheading: "2710.12.02",
      rateRaw: "429c/li",
      rateKind: "specific",
      component: { amount: 429, currency: "ZAc", perQuantity: 1, unit: "li" }
    }
  },
  {
    part: "5B",
    name: "Road Accident Fund levy",
    items: [
      item("Date: 2026-04-01", 30, 36),
      item("SCHEDULE 1 / PART 5B", 48, 36),
      item("Road Accident Fund", 72, 39),
      item("Tariff Heading", 72, 128),
      item("Article Description", 72, 217),
      item("Rate of", 72, 691),
      item("Fuel Levy Item", 87, 39),
      item("Road Accident Fund Levy", 87, 691),
      item("197.00", 102, 39),
      item("FUELS", 102, 128),
      item("197.10.03", 132, 39),
      item("2710.12.02", 132, 128),
      item("Petrol, as defined in Additional Note 1(b) to Chapter 27", 132, 217),
      item("225c/li", 132, 691)
    ],
    expected: {
      item: "197.10.03",
      tariffSubheading: "2710.12.02",
      rateRaw: "225c/li",
      rateKind: "specific",
      component: { amount: 225, currency: "ZAc", perQuantity: 1, unit: "li" }
    }
  },
  {
    part: "6",
    name: "export duty on scrap metal",
    items: [
      item("Date: 2021-08-01", 30, 36),
      item("SCHEDULE 1 / PART 6 A", 48, 364),
      item("Export Duty", 73, 33),
      item("Tariff", 73, 107),
      item("Article Description", 73, 181),
      item("Rate of Export Duty", 73, 503),
      item("Item", 90, 33),
      item("Subheading", 90, 107),
      item("General", 90, 366),
      item("EU / UK", 90, 416),
      item("EFTA", 90, 472),
      item("SADC", 90, 536),
      item("MERCOSUR", 90, 593),
      item("AfCFTA", 90, 657),
      item("193.00", 106, 33),
      item("EXPORT DUTY ON SCRAP METAL", 106, 107),
      item("193.01.01", 149, 33),
      item("7204.10", 149, 107),
      item("Waste and scrap of cast iron", 149, 195),
      item("20%", 149, 352),
      item("10%", 149, 416),
      item("free", 149, 472),
      item("free", 149, 536),
      item("20%", 149, 593),
      item("20%", 149, 657)
    ],
    expected: {
      item: "193.01.01",
      tariffSubheading: "7204.10",
      rateRaw: "20% 10% free free 20% 20%",
      rateKind: "formula"
    }
  },
  {
    part: "7A",
    name: "sugary beverages",
    items: [
      item("Date: 2022-10-01", 30, 36),
      item("SCHEDULE 1 / PART 7A", 48, 36),
      item("Health", 72, 39),
      item("Tariff", 72, 115),
      item("Article Description", 72, 210),
      item("Rate of Health", 72, 702),
      item("Promotion", 82, 39),
      item("Subheading", 82, 115),
      item("Promotion Levy", 82, 702),
      item("Levy Item", 91, 39),
      item("191.00", 106, 39),
      item("LEVY ON SUGARY BEVERAGES", 106, 115),
      item("191.01.05", 150, 39),
      item("1806.10.05", 150, 115),
      item("Preparations for making beverages", 150, 210),
      item("2,21c/gram of the sugar content", 150, 702),
      item("that exceeds 4g/100ml", 159, 702)
    ],
    expected: {
      item: "191.01.05",
      tariffSubheading: "1806.10.05",
      rateRaw: "2,21c/gram of the sugar content that exceeds 4g/100ml",
      rateKind: "specific",
      component: { amount: 2.21, currency: "ZAc", perQuantity: 1, unit: "gram of the sugar content that exceeds 4g/100ml" }
    }
  },
  {
    part: "8",
    name: "ordinary levy",
    items: [
      item("Date as on : 2010-03-08", 30, 36),
      item("SCHEDULE 1 / PART 8", 48, 36),
      item("Ordinary", 56, 45),
      item("Descrption", 56, 116),
      item("Rate of Ordinary Levy", 56, 514),
      item("Levy Item", 67, 45),
      item("196.10", 86, 43),
      item("Goods of any description, for the exclusive use by any department", 86, 117),
      item("The rate of duty specified in respect of those goods in Parts 1 and 2", 86, 514),
      item("provincial sphere of government", 97, 117),
      item("of Schedule No. 1", 97, 514)
    ],
    expected: {
      item: "196.10",
      tariffSubheading: "",
      rateRaw: "The rate of duty specified in respect of those goods in Parts 1 and 2 of Schedule No. 1",
      rateKind: "formula"
    }
  }
];

for (const fixture of remainingSchedule1ExciseLevyCases) {
  test(`parses Schedule 1 Part ${fixture.part} ${fixture.name} rows`, () => {
    const result = parseSchedule1ExciseLeviesTextPages({
      sourceDocumentSha256,
      pages: [page(fixture.items)]
    });
    const [line] = result.exciseLevyLines;

    assert.equal(result.metrics.candidateRows, 1);
    assert.equal(result.metrics.exciseLevyLines, 1);
    assert.equal(result.metrics.rejectedRows, 0);
    assert.equal(line.part, fixture.part);
    assert.equal(line.item, fixture.expected.item);
    assert.equal(line.tariffSubheading, fixture.expected.tariffSubheading);
    assert.equal(line.rate.raw, fixture.expected.rateRaw);
    assert.equal(line.rate.kind, fixture.expected.rateKind);
    assert.equal(line.validFrom, fixture.items[0].text.match(/\d{4}-\d{2}-\d{2}/)[0]);
    if (fixture.expected.component) assert.deepEqual(line.rate.components[0], fixture.expected.component);
  });
}

test("does not create Schedule 1 excise levy lines from notes-only parts", () => {
  const result = parseSchedule1ExciseLeviesTextPages({
    sourceDocumentSha256,
    pages: [
      page([
        item("Date: 2026-03-27", 30, 36),
        item("SCHEDULE 1 / PART 3", 48, 36),
        item("ENVIRONMENTAL LEVY", 71, 36),
        item("NOTES:", 89, 36),
        item("1.", 123, 36),
        item("Whenever the tariff heading or subheading under which any goods are classified", 123, 70)
      ]),
      page([
        item("Date: 2019-04-01", 30, 36),
        item("SCHEDULE 1 / PART 7", 48, 36),
        item("HEALTH PROMOTION LEVY", 89, 36),
        item("NOTES:", 107, 36),
        item("1.", 123, 36),
        item("Whenever the tariff heading or subheading under which any goods are classified", 123, 70)
      ], 2)
    ]
  });

  assert.equal(result.metrics.exciseLevyLines, 0);
  assert.equal(result.exciseLevyLines.length, 0);
  assert.equal(result.warnings[0], "No Schedule 1 excise or levy lines were parsed from the supplied pages.");
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

const remainingSchedule1LiveSmokeCases = [
  {
    part: "3C",
    env: "OPENSCHEDULE_SARS_SCHEDULE1_PART3C_PDF_PATH",
    pages: [3],
    minLines: 7,
    find: (line) => line.item === "149.01.05" && line.rate.raw === "R20.00/lamp"
  },
  {
    part: "3D",
    env: "OPENSCHEDULE_SARS_SCHEDULE1_PART3D_PDF_PATH",
    pages: [3, 4],
    minLines: 10,
    find: (line) => line.item === "151.01.09" && line.rate.kind === "specific" && line.rate.components[0]?.amount === 146
  },
  {
    part: "3E",
    env: "OPENSCHEDULE_SARS_SCHEDULE1_PART3E_PDF_PATH",
    pages: [3],
    minLines: 10,
    find: (line) => line.item === "152.01.01" && line.rate.raw === "R2.30/kg net"
  },
  {
    part: "3F",
    env: "OPENSCHEDULE_SARS_SCHEDULE1_PART3F_PDF_PATH",
    pages: [3],
    minLines: 3,
    find: (line) => line.item === "157.01" && line.rate.kind === "specific" && line.rate.components[0]?.amount === 308
  },
  {
    part: "5A",
    env: "OPENSCHEDULE_SARS_SCHEDULE1_PART5A_PDF_PATH",
    pages: [4],
    minLines: 10,
    find: (line) => line.item === "195.10.03" && line.rate.raw === "429c/li"
  },
  {
    part: "5B",
    env: "OPENSCHEDULE_SARS_SCHEDULE1_PART5B_PDF_PATH",
    pages: [3],
    minLines: 10,
    find: (line) => line.item === "197.10.03" && line.rate.raw === "225c/li"
  },
  {
    part: "6",
    env: "OPENSCHEDULE_SARS_SCHEDULE1_PART6_PDF_PATH",
    pages: [3],
    minLines: 7,
    find: (line) => line.item === "193.01.01" && line.rate.raw === "20% 10% free free 20% 20%"
  },
  {
    part: "7A",
    env: "OPENSCHEDULE_SARS_SCHEDULE1_PART7A_PDF_PATH",
    pages: [3, 4],
    minLines: 10,
    find: (line) => line.item === "191.01.05" && line.rate.raw === "2,21c/gram of the sugar content that exceeds 4g/100ml"
  },
  {
    part: "8",
    env: "OPENSCHEDULE_SARS_SCHEDULE1_PART8_PDF_PATH",
    pages: [2],
    minLines: 2,
    find: (line) => line.item === "196.10" && line.rate.kind === "formula"
  }
];

for (const smoke of remainingSchedule1LiveSmokeCases) {
  test(`optionally parses the live cached SARS Schedule 1 Part ${smoke.part} PDF when ${smoke.env} is set`, async (t) => {
    const pdfPath = process.env[smoke.env];
    if (!pdfPath) {
      t.skip(`Set ${smoke.env} to run the local SARS Schedule 1 Part ${smoke.part} parser smoke check.`);
      return;
    }

    const result = await parseSchedule1ExciseLeviesPdf({ pdfPath, pages: smoke.pages });
    assert.ok(result.exciseLevyLines.length >= smoke.minLines);
    assert.ok(result.exciseLevyLines.some(smoke.find));
    assert.equal(result.exciseLevyLines[0].sourceTrace[0].sourceDocumentSha256.length, 64);
  });
}

test("optionally checks live cached SARS Schedule 1 Part 3 notes-only PDF when OPENSCHEDULE_SARS_SCHEDULE1_PART3_PDF_PATH is set", async (t) => {
  const pdfPath = process.env.OPENSCHEDULE_SARS_SCHEDULE1_PART3_PDF_PATH;
  if (!pdfPath) {
    t.skip("Set OPENSCHEDULE_SARS_SCHEDULE1_PART3_PDF_PATH to run the local SARS Schedule 1 Part 3 notes-only smoke check.");
    return;
  }

  const result = await parseSchedule1ExciseLeviesPdf({ pdfPath });
  assert.equal(result.exciseLevyLines.length, 0);
  assert.equal(result.warnings[0], "No Schedule 1 excise or levy lines were parsed from the supplied pages.");
});

test("optionally checks live cached SARS Schedule 1 Part 7 notes-only PDF when OPENSCHEDULE_SARS_SCHEDULE1_PART7_PDF_PATH is set", async (t) => {
  const pdfPath = process.env.OPENSCHEDULE_SARS_SCHEDULE1_PART7_PDF_PATH;
  if (!pdfPath) {
    t.skip("Set OPENSCHEDULE_SARS_SCHEDULE1_PART7_PDF_PATH to run the local SARS Schedule 1 Part 7 notes-only smoke check.");
    return;
  }

  const result = await parseSchedule1ExciseLeviesPdf({ pdfPath });
  assert.equal(result.exciseLevyLines.length, 0);
  assert.equal(result.warnings[0], "No Schedule 1 excise or levy lines were parsed from the supplied pages.");
});
