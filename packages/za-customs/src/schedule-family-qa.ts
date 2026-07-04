import type {
  Schedule1ExciseLeviesParseResultV1,
  Schedule2ParseResultV1,
  Schedule3ParseResultV1,
  Schedule4ParseResultV1,
  Schedule5ParseResultV1,
  Schedule6ParseResultV1,
  ScheduleFamilyQaIssueCategoryV1,
  ScheduleFamilyQaIssueV1,
  ScheduleFamilyQaReportV1,
  ScheduleFamilyV1
} from "./types.js";
import type { SourceTraceV1 } from "@openschedule/core";

export type ScheduleFamilyQaSource =
  | Schedule1ExciseLeviesParseResultV1
  | Schedule2ParseResultV1
  | Schedule3ParseResultV1
  | Schedule4ParseResultV1
  | Schedule5ParseResultV1
  | Schedule6ParseResultV1;

export interface CreateScheduleFamilyQaReportOptions {
  lowConfidenceThreshold?: number;
  highRejectionPageThreshold?: number;
}

interface QaLine {
  schedule: ScheduleFamilyV1;
  lineKey: string;
  normalizedLineKey: string;
  sourceTrace: SourceTraceV1[];
  parseConfidence: number;
  warnings: string[];
  requiredFields: Array<{ name: string; value: string }>;
}

interface PageMetric {
  pageNumber: number;
  rejectedRows: number;
}

export function createScheduleFamilyQaReport(
  source: ScheduleFamilyQaSource,
  options: CreateScheduleFamilyQaReportOptions = {}
): ScheduleFamilyQaReportV1 {
  const family = familyLines(source);
  const issues: ScheduleFamilyQaIssueV1[] = [];
  const warnings: string[] = [];
  const lowConfidenceThreshold = options.lowConfidenceThreshold ?? 0.85;
  const highRejectionPageThreshold = options.highRejectionPageThreshold ?? 10;
  const duplicateKeys = new Map<string, QaLine[]>();

  for (const line of family.lines) {
    if (line.parseConfidence < lowConfidenceThreshold) {
      addLineIssue(
        issues,
        "low_confidence_line",
        "warning",
        line,
        `Parser confidence ${line.parseConfidence} is below ${lowConfidenceThreshold}.`
      );
    }

    if (hasContinuationRows(line)) {
      addLineIssue(issues, "continuation_row", "info", line, "Source text spans multiple layout rows.");
    }

    if (!line.sourceTrace.length) {
      addLineIssue(issues, "missing_source_trace", "error", line, "Line has no source trace.");
    }

    for (const field of line.requiredFields) {
      if (!field.value.trim()) {
        addLineIssue(issues, "missing_required_field", "warning", line, `Missing ${field.name}.`, field.name);
      }
    }

    const matches = duplicateKeys.get(line.normalizedLineKey) ?? [];
    matches.push(line);
    duplicateKeys.set(line.normalizedLineKey, matches);
  }

  for (const matches of duplicateKeys.values()) {
    if (matches.length > 1) {
      for (const line of matches) {
        addLineIssue(
          issues,
          "duplicate_normalized_family_key",
          "error",
          line,
          `Normalized family key ${line.normalizedLineKey} appears ${matches.length} times.`
        );
      }
    }
  }

  if (family.pageMetrics?.length) {
    for (const page of family.pageMetrics) {
      if (page.rejectedRows >= highRejectionPageThreshold) {
        issues.push({
          category: "page_high_rejection_count",
          severity: "warning",
          message: `Page ${page.pageNumber} rejected ${page.rejectedRows} candidate rows.`,
          schedule: family.schedule,
          page: page.pageNumber
        });
      }
    }
  } else {
    warnings.push("Per-page rejection counts are unavailable; rebuild with the current parser to include pageMetrics.");
  }

  return {
    schemaVersion: "za-customs.schedule-family-qa-report.v1",
    schedule: family.schedule,
    summary: {
      lines: family.lines.length,
      lowConfidenceLines: countIssues(issues, "low_confidence_line"),
      continuationRows: countIssues(issues, "continuation_row"),
      duplicateNormalizedFamilyKeys: new Set(
        issues
          .filter((issue) => issue.category === "duplicate_normalized_family_key")
          .map((issue) => issue.normalizedLineKey)
      ).size,
      linesMissingSourceTrace: countIssues(issues, "missing_source_trace"),
      missingRequiredFields: countIssues(issues, "missing_required_field"),
      pagesWithHighRejectionCounts: countIssues(issues, "page_high_rejection_count")
    },
    issues,
    warnings
  };
}

export function createSchedule2QaReport(
  source: Schedule2ParseResultV1,
  options: CreateScheduleFamilyQaReportOptions = {}
): ScheduleFamilyQaReportV1 {
  return createScheduleFamilyQaReport(source, options);
}

export function createSchedule3QaReport(
  source: Schedule3ParseResultV1,
  options: CreateScheduleFamilyQaReportOptions = {}
): ScheduleFamilyQaReportV1 {
  return createScheduleFamilyQaReport(source, options);
}

export function createSchedule4QaReport(
  source: Schedule4ParseResultV1,
  options: CreateScheduleFamilyQaReportOptions = {}
): ScheduleFamilyQaReportV1 {
  return createScheduleFamilyQaReport(source, options);
}

export function createSchedule5QaReport(
  source: Schedule5ParseResultV1,
  options: CreateScheduleFamilyQaReportOptions = {}
): ScheduleFamilyQaReportV1 {
  return createScheduleFamilyQaReport(source, options);
}

export function createSchedule6QaReport(
  source: Schedule6ParseResultV1,
  options: CreateScheduleFamilyQaReportOptions = {}
): ScheduleFamilyQaReportV1 {
  return createScheduleFamilyQaReport(source, options);
}

export function createSchedule1ExciseLeviesQaReport(
  source: Schedule1ExciseLeviesParseResultV1,
  options: CreateScheduleFamilyQaReportOptions = {}
): ScheduleFamilyQaReportV1 {
  return createScheduleFamilyQaReport(source, options);
}

function familyLines(source: ScheduleFamilyQaSource): {
  schedule: ScheduleFamilyV1;
  lines: QaLine[];
  pageMetrics?: PageMetric[];
} {
  switch (source.schemaVersion) {
    case "za-customs.schedule1-excise-levies-parse-result.v1":
      return {
        schedule: "schedule1-excise-levies",
        lines: source.exciseLevyLines.map((line) => ({
          schedule: "schedule1-excise-levies",
          lineKey: [line.part, line.item, line.tariffSubheading].join(" / "),
          normalizedLineKey: normalizeKey(line.part, line.normalizedItem, line.normalizedTariffSubheading),
          sourceTrace: line.sourceTrace,
          parseConfidence: line.parseConfidence,
          warnings: line.warnings,
          requiredFields: [{ name: "rate", value: line.rate.raw }]
        })),
        pageMetrics: source.pageMetrics
      };
    case "za-customs.schedule2-parse-result.v1":
      return {
        schedule: "schedule2",
        lines: source.tradeRemedyLines.map((line) => ({
          schedule: "schedule2",
          lineKey: [line.item, line.tariffHeading, line.code, line.originatingCountryOrTerritory].join(" / "),
          normalizedLineKey: normalizeKey(line.normalizedItem, line.normalizedTariffHeading, line.normalizedCode, line.originatingCountryOrTerritory),
          sourceTrace: line.sourceTrace,
          parseConfidence: line.parseConfidence,
          warnings: line.warnings,
          requiredFields: [
            { name: "originatingCountryOrTerritory", value: line.originatingCountryOrTerritory },
            { name: "rate", value: line.rate.raw }
          ]
        })),
        pageMetrics: source.pageMetrics
      };
    case "za-customs.schedule3-parse-result.v1":
      return {
        schedule: "schedule3",
        lines: source.rebateLines.map((line) => ({
          schedule: "schedule3",
          lineKey: [line.part, line.rebateItem, line.tariffHeading, line.rebateCode].join(" / "),
          normalizedLineKey: normalizeKey(line.part, line.normalizedRebateItem, line.normalizedTariffHeading, line.normalizedRebateCode),
          sourceTrace: line.sourceTrace,
          parseConfidence: line.parseConfidence,
          warnings: line.warnings,
          requiredFields: [{ name: "extentOfRebate", value: line.extentOfRebate }]
        })),
        pageMetrics: source.pageMetrics
      };
    case "za-customs.schedule4-parse-result.v1":
      return {
        schedule: "schedule4",
        lines: source.rebateLines.map((line) => ({
          schedule: "schedule4",
          lineKey: [line.part, line.rebateItem, line.tariffHeading, line.rebateCode].join(" / "),
          normalizedLineKey: normalizeKey(line.part, line.normalizedRebateItem, line.normalizedTariffHeading, line.normalizedRebateCode),
          sourceTrace: line.sourceTrace,
          parseConfidence: line.parseConfidence,
          warnings: line.warnings,
          requiredFields: [{ name: "extentOfRebate", value: line.extentOfRebate }]
        })),
        pageMetrics: source.pageMetrics
      };
    case "za-customs.schedule5-parse-result.v1":
      return {
        schedule: "schedule5",
        lines: source.drawbackRefundLines.map((line) => ({
          schedule: "schedule5",
          lineKey: [line.part, line.item, line.tariffHeading, line.code].join(" / "),
          normalizedLineKey: normalizeKey(line.part, line.normalizedItem, line.normalizedTariffHeading, line.normalizedCode),
          sourceTrace: line.sourceTrace,
          parseConfidence: line.parseConfidence,
          warnings: line.warnings,
          requiredFields: [{ name: "extentOfRefundOrDrawback", value: line.extentOfRefundOrDrawback }]
        })),
        pageMetrics: source.pageMetrics
      };
    case "za-customs.schedule6-parse-result.v1":
      return {
        schedule: "schedule6",
        lines: source.exciseRebateRefundLines.map((line) => ({
          schedule: "schedule6",
          lineKey: [line.part, line.item, line.tariffItem, line.rebateCode].join(" / "),
          normalizedLineKey: normalizeKey(line.part, line.normalizedItem, line.normalizedTariffItem, line.normalizedRebateCode),
          sourceTrace: line.sourceTrace,
          parseConfidence: line.parseConfidence,
          warnings: line.warnings,
          requiredFields: [{ name: "extentOfRebateOrRefund", value: `${line.extentOfRebate}${line.extentOfRefund}` }]
        })),
        pageMetrics: source.pageMetrics
      };
  }
}

function addLineIssue(
  issues: ScheduleFamilyQaIssueV1[],
  category: ScheduleFamilyQaIssueCategoryV1,
  severity: ScheduleFamilyQaIssueV1["severity"],
  line: QaLine,
  message: string,
  field?: string
): void {
  issues.push({
    category,
    severity,
    message,
    schedule: line.schedule,
    lineKey: line.lineKey,
    normalizedLineKey: line.normalizedLineKey,
    field,
    page: line.sourceTrace[0]?.page ?? null,
    sourceTrace: line.sourceTrace
  });
}

function countIssues(issues: readonly ScheduleFamilyQaIssueV1[], category: ScheduleFamilyQaIssueCategoryV1): number {
  return issues.filter((issue) => issue.category === category).length;
}

function hasContinuationRows(line: QaLine): boolean {
  if (line.warnings.some((warning) => warning.includes("continued across layout rows"))) return true;
  const locator = line.sourceTrace[0]?.locator ?? "";
  const match = locator.match(/row=([0-9.]+)-([0-9.]+)/);
  return Boolean(match && match[1] !== match[2]);
}

function normalizeKey(...parts: readonly string[]): string {
  return parts.map((part) => part.trim().toLowerCase().replace(/\s+/g, " ")).join("|");
}
