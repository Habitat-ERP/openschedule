import {
  CUSTOMS_RATE_COLUMNS,
  type CustomsRulesetV1,
  type Schedule1LineInspectionV1,
  type Schedule1ParseResultV1,
  type Schedule1QaIssueCategoryV1,
  type Schedule1QaIssueV1,
  type Schedule1QaReportV1,
  type TariffLineV1
} from "./types.js";

export type Schedule1QaSource = CustomsRulesetV1 | Schedule1ParseResultV1;

export interface CreateSchedule1QaReportOptions {
  lowConfidenceThreshold?: number;
  highRejectionPageThreshold?: number;
  reviewTariffCodes?: readonly string[];
}

export const SCHEDULE1_TRICKY_CASE_CODES = [
  "0105.99",
  "0203.21",
  "0201.10",
  "0301.11",
  "0501.00",
  "9801.00.03",
  "9901.00.03",
  "0304.44",
  "0210.99.12",
  "4414.00",
  "0402.10.10",
  "1604.17.10",
  "2106.90.67",
  "3306.10",
  "6103.22",
  "8704.10.20",
  "2930.90.01",
  "2903.92.10",
  "5907.00.10",
  "8702.10.10",
  "8704.21.81",
  "8708.30.05",
  "9801.00.40",
  "9901.00.07",
  "9992.00"
] as const;

export function inspectSchedule1TariffLine(
  source: Schedule1QaSource,
  tariffCode: string
): Schedule1LineInspectionV1 | null {
  const normalized = normalizeTariffCode(tariffCode);
  const line = tariffLines(source).find((item) => item.normalizedTariffCode === normalized);
  return line ? inspectLine(line) : null;
}

export function inspectSchedule1TariffLines(
  source: Schedule1QaSource,
  tariffCodes: readonly string[]
): Schedule1LineInspectionV1[] {
  return tariffCodes.map((code) => {
    const inspection = inspectSchedule1TariffLine(source, code);
    if (!inspection) throw new Error(`No tariff line found for ${code}.`);
    return inspection;
  });
}

export function createSchedule1QaReport(
  source: Schedule1QaSource,
  options: CreateSchedule1QaReportOptions = {}
): Schedule1QaReportV1 {
  const lines = tariffLines(source);
  const issues: Schedule1QaIssueV1[] = [];
  const warnings: string[] = [];
  const lowConfidenceThreshold = options.lowConfidenceThreshold ?? 0.85;
  const highRejectionPageThreshold = options.highRejectionPageThreshold ?? 10;
  const duplicateCodes = new Map<string, TariffLineV1[]>();

  for (const line of lines) {
    const context = line.context ?? [];
    if (!context.length) addLineIssue(issues, "line_without_context", "info", line, "Tariff line has no hierarchy context.");

    for (const item of context) {
      if (!line.normalizedTariffCode.startsWith(item.normalizedCode)) {
        addLineIssue(
          issues,
          "context_code_prefix_mismatch",
          "error",
          line,
          `Context code ${item.code} is not a prefix of tariff code ${line.tariffCode}.`
        );
      }
    }

    for (let index = 1; index < context.length; index += 1) {
      const previous = context[index - 1];
      const current = context[index];
      if (current.level <= previous.level || !current.normalizedCode.startsWith(previous.normalizedCode)) {
        addLineIssue(
          issues,
          "suspicious_context_jump",
          "warning",
          line,
          `Context jumps from ${previous.code} to ${current.code}.`
        );
      }
    }

    if (line.parseConfidence < lowConfidenceThreshold) {
      addLineIssue(
        issues,
        "low_confidence_line",
        "warning",
        line,
        `Parser confidence ${line.parseConfidence} is below ${lowConfidenceThreshold}.`
      );
    }

    const manualRateColumns = CUSTOMS_RATE_COLUMNS.filter((column) => {
      const rate = line.rates[column];
      return rate?.kind === "unknown" || rate?.kind === "formula";
    });
    if (manualRateColumns.length) {
      addLineIssue(
        issues,
        "unknown_or_formula_rate",
        "warning",
        line,
        `Rate columns need manual review: ${manualRateColumns.join(", ")}.`
      );
    }

    if (hasContinuationRows(line)) {
      addLineIssue(issues, "continuation_row", "info", line, "Source text spans multiple layout rows.");
    }

    const existing = duplicateCodes.get(line.normalizedTariffCode) ?? [];
    existing.push(line);
    duplicateCodes.set(line.normalizedTariffCode, existing);
  }

  for (const [code, matches] of duplicateCodes) {
    if (matches.length > 1) {
      for (const line of matches) {
        addLineIssue(issues, "duplicate_normalized_code", "error", line, `Normalized tariff code ${code} appears ${matches.length} times.`);
      }
    }
  }

  const pageMetrics = source.pageMetrics;
  if (pageMetrics?.length) {
    for (const page of pageMetrics) {
      if (page.rejectedRows >= highRejectionPageThreshold) {
        issues.push({
          category: "page_high_rejection_count",
          severity: "warning",
          message: `Page ${page.pageNumber} rejected ${page.rejectedRows} candidate rows.`,
          page: page.pageNumber
        });
      }
    }
  } else {
    warnings.push("Per-page rejection counts are unavailable; rebuild with the current parser to include pageMetrics.");
  }

  const reviewSet = (options.reviewTariffCodes ?? SCHEDULE1_TRICKY_CASE_CODES).flatMap((code) => {
    const inspection = inspectSchedule1TariffLine(source, code);
    if (!inspection) {
      warnings.push(`Review tariff code ${code} was not found.`);
      return [];
    }
    return [inspection];
  });

  return {
    schemaVersion: "za-customs.schedule1-qa-report.v1",
    summary: {
      tariffLines: lines.length,
      linesWithoutContext: countIssues(issues, "line_without_context"),
      contextPrefixMismatches: countIssues(issues, "context_code_prefix_mismatch"),
      suspiciousContextJumps: countIssues(issues, "suspicious_context_jump"),
      lowConfidenceLines: countIssues(issues, "low_confidence_line"),
      unknownOrFormulaRateLines: countIssues(issues, "unknown_or_formula_rate"),
      continuationRows: countIssues(issues, "continuation_row"),
      duplicateNormalizedCodes: new Set(
        issues
          .filter((issue) => issue.category === "duplicate_normalized_code")
          .map((issue) => issue.normalizedTariffCode)
      ).size,
      pagesWithHighRejectionCounts: countIssues(issues, "page_high_rejection_count")
    },
    issues,
    reviewSet,
    warnings
  };
}

function inspectLine(line: TariffLineV1): Schedule1LineInspectionV1 {
  const trace = line.sourceTrace[0];
  const rates: Schedule1LineInspectionV1["rates"] = {};
  for (const column of CUSTOMS_RATE_COLUMNS) {
    const rate = line.rates[column];
    if (rate) rates[column] = { raw: rate.raw, kind: rate.kind, warnings: [...rate.warnings] };
  }

  return {
    schemaVersion: "za-customs.schedule1-line-inspection.v1",
    tariffCode: line.tariffCode,
    normalizedTariffCode: line.normalizedTariffCode,
    description: line.description,
    normalizedDescription: line.normalizedDescription,
    hierarchy: (line.context ?? []).map((context) => {
      const contextTrace = context.sourceTrace[0];
      return {
        code: context.code,
        normalizedCode: context.normalizedCode,
        description: context.description,
        normalizedDescription: context.normalizedDescription,
        sourcePage: contextTrace?.page ?? null,
        locator: contextTrace?.locator ?? null,
        rawSourceText: contextTrace?.text ?? null
      };
    }),
    rates,
    sourcePage: trace?.page ?? null,
    locator: trace?.locator ?? null,
    rawSourceText: trace?.text ?? null,
    warnings: [...line.warnings],
    confidence: line.parseConfidence
  };
}

function addLineIssue(
  issues: Schedule1QaIssueV1[],
  category: Schedule1QaIssueCategoryV1,
  severity: Schedule1QaIssueV1["severity"],
  line: TariffLineV1,
  message: string
): void {
  issues.push({
    category,
    severity,
    message,
    tariffCode: line.tariffCode,
    normalizedTariffCode: line.normalizedTariffCode,
    page: line.sourceTrace[0]?.page ?? null,
    sourceTrace: line.sourceTrace
  });
}

function countIssues(issues: readonly Schedule1QaIssueV1[], category: Schedule1QaIssueCategoryV1): number {
  return issues.filter((issue) => issue.category === category).length;
}

function hasContinuationRows(line: TariffLineV1): boolean {
  if (line.warnings.some((warning) => warning.includes("continued across layout rows"))) return true;
  const locator = line.sourceTrace[0]?.locator ?? "";
  const match = locator.match(/row=([0-9.]+)-([0-9.]+)/);
  return Boolean(match && match[1] !== match[2]);
}

function tariffLines(source: Schedule1QaSource): TariffLineV1[] {
  return source.tariffLines;
}

function normalizeTariffCode(value: string): string {
  return value.replace(/\D/g, "");
}
