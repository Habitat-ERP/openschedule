import assert from "node:assert/strict";
import test from "node:test";
import {
  createSchedule2QaReport,
  createSchedule6QaReport,
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
