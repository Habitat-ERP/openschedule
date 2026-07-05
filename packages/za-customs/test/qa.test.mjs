import assert from "node:assert/strict";
import test from "node:test";
import {
  createSchedule1QaReport,
  inspectSchedule1TariffLines
} from "../dist/src/internal.js";

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

function rate(raw, kind, warnings = []) {
  return { raw, kind, components: [], warnings };
}

function tariffLine(overrides = {}) {
  const tariffCode = overrides.tariffCode ?? "0001.10";
  return {
    schemaVersion: "za-customs.tariff-line.v1",
    tariffCode,
    normalizedTariffCode: tariffCode.replace(/\D/g, ""),
    checkDigit: "1",
    description: overrides.description ?? "Synthetic goods",
    normalizedDescription: overrides.normalizedDescription ?? "Synthetic goods",
    statisticalUnit: "kg",
    rates: overrides.rates ?? {
      general: rate("10%", "ad_valorem"),
      sadc: rate("free", "free")
    },
    validFrom: "2026-05-29",
    context: overrides.context ?? [
      {
        code: "00.01",
        normalizedCode: "0001",
        description: "Synthetic heading:",
        normalizedDescription: "Synthetic heading",
        level: 4,
        sourceTrace: [sourceTrace("00.01 Synthetic heading")]
      }
    ],
    sourceTrace: [sourceTrace(overrides.text ?? `${tariffCode} Synthetic goods`)],
    parseConfidence: overrides.parseConfidence ?? 1,
    warnings: overrides.warnings ?? []
  };
}

function parseResult(lines) {
  return {
    schemaVersion: "za-customs.schedule1-parse-result.v1",
    tariffLines: lines,
    warnings: [],
    metrics: {
      pagesParsed: 1,
      textItems: 1,
      layoutRows: 1,
      candidateRows: lines.length,
      contextRows: 1,
      tariffLines: lines.length,
      rejectedRows: 3
    },
    pageMetrics: [
      {
        pageNumber: 1,
        textItems: 1,
        layoutRows: 1,
        candidateRows: lines.length,
        contextRows: 1,
        tariffLines: lines.length,
        rejectedRows: 3
      }
    ]
  };
}

test("inspects specific tariff lines with source and hierarchy context", () => {
  const [inspection] = inspectSchedule1TariffLines(parseResult([tariffLine()]), ["0001.10"]);

  assert.equal(inspection.schemaVersion, "za-customs.schedule1-line-inspection.v1");
  assert.equal(inspection.tariffCode, "0001.10");
  assert.equal(inspection.hierarchy[0].code, "00.01");
  assert.equal(inspection.rates.general.raw, "10%");
  assert.equal(inspection.sourcePage, 1);
  assert.match(inspection.locator, /^pdfjs-dist:row=/);
  assert.match(inspection.rawSourceText, /Synthetic goods/);
  assert.equal(inspection.confidence, 1);
});

test("reports parser QA queues and tricky review-set inspections", () => {
  const result = createSchedule1QaReport(
    parseResult([
      tariffLine(),
      tariffLine({
        tariffCode: "0001.20",
        context: [],
        rates: { general: rate("See Note 1", "formula", ["Unclassified general rate text: See Note 1"]) },
        parseConfidence: 0.76,
        warnings: ["Unclassified general rate text: See Note 1", "Description or rate text continued across layout rows."],
        text: "0001.20 Synthetic formula goods"
      })
    ]),
    { reviewTariffCodes: ["0001.10", "0001.20"], highRejectionPageThreshold: 2 }
  );

  assert.equal(result.schemaVersion, "za-customs.schedule1-qa-report.v1");
  assert.equal(result.summary.tariffLines, 2);
  assert.equal(result.summary.linesWithoutContext, 1);
  assert.equal(result.summary.lowConfidenceLines, 1);
  assert.equal(result.summary.unknownOrFormulaRateLines, 1);
  assert.equal(result.summary.continuationRows, 1);
  assert.equal(result.summary.pagesWithHighRejectionCounts, 1);
  assert.deepEqual(result.reviewSet.map((line) => line.tariffCode), ["0001.10", "0001.20"]);
});
