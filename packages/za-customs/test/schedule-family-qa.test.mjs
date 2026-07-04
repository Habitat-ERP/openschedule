import assert from "node:assert/strict";
import test from "node:test";
import {
  createSchedule2QaReport,
  createSchedule3QaReport,
  createSchedule4QaReport,
  createSchedule5QaReport,
  createSchedule6QaReport,
  parseSchedule2TradeRemediesTextPages,
  parseSchedule3IndustrialRebatesTextPages,
  parseSchedule4RebatesTextPages,
  parseSchedule5DrawbacksRefundsTextPages,
  parseSchedule6ExciseRebatesRefundsTextPages,
  ScheduleFamilyQaReportV1Schema
} from "../dist/src/index.js";

const sourceDocumentSha256 = "0".repeat(64);

function sourceTrace(text, page = 1, locator = "pdfjs-dist:row=10.00-10.00;columns=39.00-486.00") {
  return {
    schemaVersion: "core.source-trace.v1",
    sourceDocumentSha256,
    page,
    locator,
    text
  };
}

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

function rate(raw) {
  return { raw, kind: raw ? "ad_valorem" : "unknown", components: [], warnings: raw ? [] : ["Missing anti-dumping duty rate."] };
}

function schedule2Line(overrides = {}) {
  return {
    schemaVersion: "za-customs.schedule2-trade-remedy-line.v1",
    item: "201.02",
    normalizedItem: "20102",
    tariffHeading: "0207.14.9",
    normalizedTariffHeading: "0207149",
    code: "03.07",
    normalizedCode: "0307",
    checkDigit: "70",
    description: "Synthetic trade remedy goods",
    normalizedDescription: "Synthetic trade remedy goods",
    rebateItems: [],
    originatingCountryOrTerritory: "Germany",
    rate: rate("73,33%"),
    validFrom: "2026-06-12",
    sourceTrace: [sourceTrace("201.02 synthetic trade remedy goods")],
    parseConfidence: 1,
    warnings: [],
    ...overrides
  };
}

function schedule2Result(lines) {
  return {
    schemaVersion: "za-customs.schedule2-parse-result.v1",
    tradeRemedyLines: lines,
    warnings: [],
    metrics: {
      pagesParsed: 1,
      textItems: 1,
      layoutRows: 1,
      candidateRows: lines.length,
      contextRows: 0,
      tradeRemedyLines: lines.length,
      rejectedRows: 2
    },
    pageMetrics: [
      {
        pageNumber: 1,
        textItems: 1,
        layoutRows: 1,
        candidateRows: lines.length,
        contextRows: 0,
        tradeRemedyLines: lines.length,
        rejectedRows: 2
      }
    ]
  };
}

test("exports the Schedule family QA report schema", () => {
  assert.equal(ScheduleFamilyQaReportV1Schema.properties.schemaVersion.const, "za-customs.schedule-family-qa-report.v1");
});

test("reports shared QA issues for Schedule 2 family output", () => {
  const first = schedule2Line({
    originatingCountryOrTerritory: "",
    rate: rate(""),
    sourceTrace: [],
    parseConfidence: 0.7,
    warnings: ["Description or column text continued across layout rows."]
  });
  const second = schedule2Line({
    originatingCountryOrTerritory: "",
    rate: rate("")
  });
  const report = createSchedule2QaReport(schedule2Result([first, second]), {
    highRejectionPageThreshold: 2
  });

  assert.equal(report.schemaVersion, "za-customs.schedule-family-qa-report.v1");
  assert.equal(report.schedule, "schedule2");
  assert.equal(report.summary.lines, 2);
  assert.equal(report.summary.lowConfidenceLines, 1);
  assert.equal(report.summary.continuationRows, 1);
  assert.equal(report.summary.duplicateNormalizedFamilyKeys, 1);
  assert.equal(report.summary.linesMissingSourceTrace, 1);
  assert.equal(report.summary.missingRequiredFields, 4);
  assert.equal(report.summary.pagesWithHighRejectionCounts, 1);
  assert.ok(report.issues.some((issue) => issue.category === "missing_required_field" && issue.field === "rate"));
});

test("reports Schedule 6 lines missing both rebate and refund extent", () => {
  const report = createSchedule6QaReport({
    schemaVersion: "za-customs.schedule6-parse-result.v1",
    exciseRebateRefundLines: [
      {
        schemaVersion: "za-customs.schedule6-excise-rebate-refund-line.v1",
        part: "1B",
        item: "619.01",
        normalizedItem: "61901",
        tariffItem: "104.10.10",
        normalizedTariffItem: "1041010",
        rebateCode: "01.01",
        normalizedRebateCode: "0101",
        checkDigit: "76",
        description: "Synthetic Schedule 6 excise goods",
        normalizedDescription: "Synthetic Schedule 6 excise goods",
        extentOfRebate: "",
        extentOfRefund: "",
        validFrom: "2026-07-01",
        sourceTrace: [sourceTrace("619.01 synthetic excise goods")],
        parseConfidence: 1,
        warnings: []
      }
    ],
    warnings: [],
    metrics: {
      pagesParsed: 1,
      textItems: 1,
      layoutRows: 1,
      candidateRows: 1,
      contextRows: 0,
      exciseRebateRefundLines: 1,
      rejectedRows: 0
    }
  });

  assert.equal(report.schedule, "schedule6");
  assert.equal(report.summary.missingRequiredFields, 1);
  assert.equal(report.issues[0].field, "extentOfRebateOrRefund");
  assert.equal(report.warnings.length, 1);
});

test("keeps parser-to-QA reports clean for complete Schedule 2-6 rows", () => {
  const reports = [
    createSchedule2QaReport(
      parseSchedule2TradeRemediesTextPages({
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
            item("Frozen meat of fowls", 126, 210),
            item("Germany", 126, 617),
            item("73,33%", 126, 702)
          ])
        ]
      })
    ),
    createSchedule3QaReport(
      parseSchedule3IndustrialRebatesTextPages({
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
            item("Palm stearin, not chemically modified", 126, 250),
            item("Full duty", 126, 702)
          ])
        ]
      })
    ),
    createSchedule4QaReport(
      parseSchedule4RebatesTextPages({
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
            item("Mackerel, imported by specific permit", 126, 250),
            item("Full duty", 126, 702)
          ])
        ]
      })
    ),
    createSchedule5QaReport(
      parseSchedule5DrawbacksRefundsTextPages({
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
            item("501.02", 126, 39),
            item("03.05", 126, 115),
            item("01.04", 126, 180),
            item("43", 126, 225),
            item("Salted fish, used in the manufacture of dried fish", 126, 250),
            item("Full duty", 126, 702)
          ])
        ]
      })
    ),
    createSchedule6QaReport(
      parseSchedule6ExciseRebatesRefundsTextPages({
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
            item("619.01", 111, 39),
            item("104.10.10", 111, 96),
            item("01.01", 111, 153),
            item("76", 111, 215),
            item("Traditional African Beer", 111, 238),
            item("Full duty", 111, 581)
          ])
        ]
      })
    )
  ];

  assert.deepEqual(reports.map((report) => report.schedule), ["schedule2", "schedule3", "schedule4", "schedule5", "schedule6"]);
  for (const report of reports) {
    assert.equal(report.summary.lines, 1);
    assert.deepEqual(report.issues, []);
    assert.deepEqual(report.warnings, []);
  }
});
