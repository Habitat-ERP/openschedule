import { createHash } from "node:crypto";
import {
  createSourceDocumentMetadata,
  type RulesetDiffChangeV1,
  type RulesetDiffV1,
  type SourceDocumentMetadataV1,
  type SourceTraceV1,
  type ValidationIssueV1,
  type ValidationReportV1
} from "@openschedule/core";
import PackageJson from "../package.json" with { type: "json" };
import { extractCustomsPdfTextItems } from "./pdf-text.js";
import { parseSchedule1Part1TextPages } from "./schedule1-parser.js";
import { CUSTOMS_RATE_COLUMNS, type CustomsRulesetV1, type Schedule1ParseResultV1, type TariffLineV1 } from "./types.js";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export interface BuildCustomsRulesetOptions {
  parseResult: Schedule1ParseResultV1;
  sourceDocuments: readonly SourceDocumentMetadataV1[];
  generatedAt?: string;
  effectiveDate?: string | null;
}

export interface BuildCustomsRulesetFromPdfOptions {
  pdfPath: string;
  pages?: readonly number[];
  sourceUrl?: string | null;
  retrievedAt?: string | null;
  generatedAt?: string;
  effectiveDate?: string | null;
}

export async function buildCustomsRulesetFromPdf(
  options: BuildCustomsRulesetFromPdfOptions
): Promise<CustomsRulesetV1> {
  const extraction = await extractCustomsPdfTextItems({ pdfPath: options.pdfPath, pages: options.pages });
  const parseResult = parseSchedule1Part1TextPages({
    pages: extraction.pages,
    sourceDocumentSha256: extraction.sourceDocumentSha256
  });
  const sourceDocument = createSourceDocumentMetadata({
    filePath: options.pdfPath,
    sha256: extraction.sourceDocumentSha256,
    sourceUrl: options.sourceUrl ?? null,
    retrievedAt: options.retrievedAt ?? null
  });

  return buildCustomsRuleset({
    parseResult,
    sourceDocuments: [sourceDocument],
    generatedAt: options.generatedAt,
    effectiveDate: options.effectiveDate
  });
}

export function buildCustomsRuleset(options: BuildCustomsRulesetOptions): CustomsRulesetV1 {
  const tariffLines = [...options.parseResult.tariffLines].sort(compareTariffLines);
  const effectiveDate = options.effectiveDate ?? inferEffectiveDate(tariffLines) ?? null;
  const ruleset: CustomsRulesetV1 = {
    schemaVersion: "za-customs.customs-ruleset.v1",
    manifest: {
      schemaVersion: "core.ruleset-manifest.v1",
      rulesetId: "",
      domain: "za-customs",
      country: "ZA",
      publisher: "SARS",
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      effectiveDate,
      sourceDocuments: [...options.sourceDocuments].sort(compareSourceDocuments),
      parser: {
        packageName: PackageJson.name,
        packageVersion: PackageJson.version
      },
      warnings: [...options.parseResult.warnings]
    },
    parseMetrics: { ...options.parseResult.metrics },
    tariffLines
  };
  ruleset.manifest.rulesetId = calculateCustomsRulesetId(ruleset);
  return ruleset;
}

export function calculateCustomsRulesetId(ruleset: CustomsRulesetV1): string {
  const effectiveDate = ruleset.manifest.effectiveDate ?? inferEffectiveDate(ruleset.tariffLines) ?? "unknown";
  const payload = {
    domain: ruleset.manifest.domain,
    country: ruleset.manifest.country,
    publisher: ruleset.manifest.publisher,
    effectiveDate: ruleset.manifest.effectiveDate ?? null,
    sourceDocumentSha256s: ruleset.manifest.sourceDocuments.map((document) => document.sha256).sort(),
    parser: ruleset.manifest.parser,
    parseMetrics: ruleset.parseMetrics,
    tariffLines: [...ruleset.tariffLines].sort(compareTariffLines)
  };
  const hash = createHash("sha256").update(stableStringify(payload)).digest("hex").slice(0, 12);
  return `ZA_SARS_CUSTOMS_SCHEDULE_1_PART_1_${formatRulesetDate(effectiveDate)}_${hash}`;
}

export function validateCustomsRuleset(ruleset: CustomsRulesetV1): ValidationReportV1 {
  const issues: ValidationIssueV1[] = [];
  const sourceHashes = new Set(ruleset.manifest.sourceDocuments.map((document) => document.sha256));

  if (ruleset.schemaVersion !== "za-customs.customs-ruleset.v1") {
    addIssue(issues, "schema_version", "Ruleset schemaVersion is invalid.", "/schemaVersion");
  }
  if (ruleset.manifest.schemaVersion !== "core.ruleset-manifest.v1") {
    addIssue(issues, "manifest_schema_version", "Manifest schemaVersion is invalid.", "/manifest/schemaVersion");
  }
  if (!ruleset.manifest.sourceDocuments.length) {
    addIssue(issues, "source_documents_missing", "Ruleset must include at least one source document.", "/manifest/sourceDocuments");
  }

  ruleset.manifest.sourceDocuments.forEach((document, index) => {
    if (!SHA256_PATTERN.test(document.sha256)) {
      addIssue(issues, "source_document_hash", "Source document sha256 must be a lowercase SHA-256 hex digest.", `/manifest/sourceDocuments/${index}/sha256`);
    }
  });

  if (ruleset.parseMetrics.tariffLines !== ruleset.tariffLines.length) {
    addIssue(
      issues,
      "parse_metrics_mismatch",
      "parseMetrics.tariffLines must equal tariffLines.length.",
      "/parseMetrics/tariffLines"
    );
  }

  const seenCodes = new Set<string>();
  for (const [index, line] of ruleset.tariffLines.entries()) {
    const path = `/tariffLines/${index}`;
    const previous = ruleset.tariffLines[index - 1];
    if (previous && compareTariffLines(previous, line) > 0) {
      addIssue(issues, "tariff_lines_unsorted", "tariffLines must be sorted by normalizedTariffCode.", path);
    }
    if (seenCodes.has(line.normalizedTariffCode)) {
      addIssue(issues, "duplicate_tariff_code", "normalizedTariffCode values must be unique.", `${path}/normalizedTariffCode`);
    }
    seenCodes.add(line.normalizedTariffCode);

    if (normalizeTariffCode(line.tariffCode) !== line.normalizedTariffCode) {
      addIssue(issues, "code_normalization_mismatch", "normalizedTariffCode must match tariffCode digits.", `${path}/normalizedTariffCode`);
    }
    if (!line.normalizedDescription.trim()) {
      addIssue(issues, "normalized_description_missing", "normalizedDescription is required for display and search.", `${path}/normalizedDescription`);
    }
    if (!line.rates.general) {
      addIssue(issues, "general_rate_missing", "rates.general is required.", `${path}/rates/general`);
    }
    if (line.parseConfidence < 0 || line.parseConfidence > 1) {
      addIssue(issues, "parse_confidence_range", "parseConfidence must be between 0 and 1.", `${path}/parseConfidence`);
    }
    validateSourceTraces(issues, line.sourceTrace, sourceHashes, `${path}/sourceTrace`);
    line.context?.forEach((context, contextIndex) => {
      if (!context.normalizedCode || normalizeTariffCode(context.code) !== context.normalizedCode) {
        addIssue(issues, "context_code_normalization_mismatch", "context.normalizedCode must match context.code digits.", `${path}/context/${contextIndex}/normalizedCode`);
      }
      validateSourceTraces(issues, context.sourceTrace, sourceHashes, `${path}/context/${contextIndex}/sourceTrace`);
    });
  }

  const expectedRulesetId = calculateCustomsRulesetId(ruleset);
  if (ruleset.manifest.rulesetId !== expectedRulesetId) {
    addIssue(
      issues,
      "ruleset_id_mismatch",
      `rulesetId must be ${expectedRulesetId}.`,
      "/manifest/rulesetId"
    );
  }

  return {
    schemaVersion: "core.validation-report.v1",
    valid: issues.every((issue) => issue.severity !== "error"),
    issues
  };
}

export function findTariffLine(ruleset: CustomsRulesetV1, tariffCode: string): TariffLineV1 | undefined {
  const normalized = normalizeTariffCode(tariffCode);
  return ruleset.tariffLines.find((line) => line.normalizedTariffCode === normalized);
}

export function formatTariffLineLeafLabel(line: TariffLineV1): string {
  return line.normalizedDescription || line.description.trim();
}

export function formatTariffLineBreadcrumb(line: TariffLineV1): string {
  return [...(line.context ?? []).map((context) => context.normalizedDescription), formatTariffLineLeafLabel(line)]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" > ");
}

export function formatTariffLineDisplayName(line: TariffLineV1): string {
  const breadcrumb = formatTariffLineBreadcrumb(line);
  return breadcrumb ? `${line.tariffCode} - ${breadcrumb}` : line.tariffCode;
}

export function diffCustomsRulesets(before: CustomsRulesetV1, after: CustomsRulesetV1): RulesetDiffV1 {
  const changes: RulesetDiffChangeV1[] = [];
  addChangeIfDifferent(
    changes,
    "manifest_changed",
    "/manifest",
    null,
    null,
    manifestComparable(before),
    manifestComparable(after)
  );
  addChangeIfDifferent(
    changes,
    "source_metadata_changed",
    "/manifest/sourceDocuments",
    null,
    null,
    [...before.manifest.sourceDocuments].sort(compareSourceDocuments),
    [...after.manifest.sourceDocuments].sort(compareSourceDocuments)
  );
  addChangeIfDifferent(
    changes,
    "parser_changed",
    "/manifest/parser",
    null,
    null,
    before.manifest.parser,
    after.manifest.parser
  );
  addChangeIfDifferent(changes, "metrics_changed", "/parseMetrics", null, null, before.parseMetrics, after.parseMetrics);

  const beforeLines = byNormalizedCode(before.tariffLines);
  const afterLines = byNormalizedCode(after.tariffLines);
  const keys = Array.from(new Set([...beforeLines.keys(), ...afterLines.keys()])).sort();

  for (const key of keys) {
    const beforeLine = beforeLines.get(key);
    const afterLine = afterLines.get(key);
    const line = afterLine ?? beforeLine;
    const label = line ? formatTariffLineDisplayName(line) : key;
    const sourceTrace = line?.sourceTrace;
    const path = `/tariffLines/${key}`;

    if (!beforeLine && afterLine) {
      changes.push(change("line_added", path, key, label, undefined, afterLine, sourceTrace));
      continue;
    }
    if (beforeLine && !afterLine) {
      changes.push(change("line_removed", path, key, label, beforeLine, undefined, sourceTrace));
      continue;
    }
    if (!beforeLine || !afterLine) continue;

    addChangeIfDifferent(
      changes,
      "description_changed",
      `${path}/description`,
      key,
      label,
      pick(beforeLine, ["description", "normalizedDescription"]),
      pick(afterLine, ["description", "normalizedDescription"]),
      sourceTrace
    );
    addChangeIfDifferent(changes, "context_changed", `${path}/context`, key, label, beforeLine.context ?? [], afterLine.context ?? [], sourceTrace);
    addChangeIfDifferent(changes, "unit_changed", `${path}/statisticalUnit`, key, label, beforeLine.statisticalUnit ?? null, afterLine.statisticalUnit ?? null, sourceTrace);
    addChangeIfDifferent(changes, "rate_raw_changed", `${path}/rates`, key, label, rateRawMap(beforeLine), rateRawMap(afterLine), sourceTrace);
    addChangeIfDifferent(changes, "rate_components_changed", `${path}/rates`, key, label, rateComponentMap(beforeLine), rateComponentMap(afterLine), sourceTrace);
    addChangeIfDifferent(
      changes,
      "validity_changed",
      `${path}/validity`,
      key,
      label,
      pick(beforeLine, ["validFrom", "validTo"]),
      pick(afterLine, ["validFrom", "validTo"]),
      sourceTrace
    );
    addChangeIfDifferent(changes, "source_trace_changed", `${path}/sourceTrace`, key, label, beforeLine.sourceTrace, afterLine.sourceTrace, sourceTrace);
    addChangeIfDifferent(
      changes,
      "warnings_confidence_changed",
      `${path}/warnings`,
      key,
      label,
      { parseConfidence: beforeLine.parseConfidence, warnings: beforeLine.warnings },
      { parseConfidence: afterLine.parseConfidence, warnings: afterLine.warnings },
      sourceTrace
    );
  }

  return {
    schemaVersion: "core.ruleset-diff.v1",
    beforeRulesetId: before.manifest.rulesetId,
    afterRulesetId: after.manifest.rulesetId,
    changes
  };
}

function addIssue(issues: ValidationIssueV1[], code: string, message: string, path: string): void {
  issues.push({
    schemaVersion: "core.validation-issue.v1",
    severity: "error",
    code,
    message,
    path
  });
}

function validateSourceTraces(
  issues: ValidationIssueV1[],
  traces: readonly SourceTraceV1[],
  sourceHashes: ReadonlySet<string>,
  path: string
): void {
  traces.forEach((trace, index) => {
    if (!sourceHashes.has(trace.sourceDocumentSha256)) {
      addIssue(issues, "source_trace_unknown_document", "sourceTrace must reference a ruleset source document.", `${path}/${index}/sourceDocumentSha256`);
    }
  });
}

function byNormalizedCode(lines: readonly TariffLineV1[]): Map<string, TariffLineV1> {
  return new Map(lines.map((line) => [line.normalizedTariffCode, line]));
}

function addChangeIfDifferent(
  changes: RulesetDiffChangeV1[],
  category: string,
  path: string,
  key: string | null,
  label: string | null,
  before: unknown,
  after: unknown,
  sourceTrace?: SourceTraceV1[]
): void {
  if (stableStringify(before) !== stableStringify(after)) {
    changes.push(change(category, path, key, label, before, after, sourceTrace));
  }
}

function change(
  category: string,
  path: string,
  key: string | null,
  label: string | null,
  before: unknown,
  after: unknown,
  sourceTrace?: SourceTraceV1[]
): RulesetDiffChangeV1 {
  return {
    schemaVersion: "core.ruleset-diff-change.v1",
    category,
    path,
    key,
    label,
    before,
    after,
    sourceTrace
  };
}

function manifestComparable(ruleset: CustomsRulesetV1): Record<string, unknown> {
  return {
    domain: ruleset.manifest.domain,
    country: ruleset.manifest.country,
    publisher: ruleset.manifest.publisher,
    effectiveDate: ruleset.manifest.effectiveDate ?? null,
    warnings: ruleset.manifest.warnings
  };
}

function pick<T extends object, K extends keyof T>(value: T, keys: readonly K[]): Pick<T, K> {
  return Object.fromEntries(keys.map((key) => [key, value[key]])) as Pick<T, K>;
}

function rateRawMap(line: TariffLineV1): Record<string, string | null> {
  return Object.fromEntries(CUSTOMS_RATE_COLUMNS.map((column) => [column, line.rates[column]?.raw ?? null]));
}

function rateComponentMap(line: TariffLineV1): Record<string, unknown> {
  return Object.fromEntries(
    CUSTOMS_RATE_COLUMNS.map((column) => [
      column,
      line.rates[column]
        ? {
            kind: line.rates[column]?.kind,
            components: line.rates[column]?.components,
            warnings: line.rates[column]?.warnings
          }
        : null
    ])
  );
}

function inferEffectiveDate(lines: readonly TariffLineV1[]): string | undefined {
  return lines.find((line) => line.validFrom && line.validFrom !== "unknown")?.validFrom;
}

function normalizeTariffCode(tariffCode: string): string {
  return tariffCode.replace(/\D/g, "");
}

function compareTariffLines(left: TariffLineV1, right: TariffLineV1): number {
  return left.normalizedTariffCode.localeCompare(right.normalizedTariffCode) || left.tariffCode.localeCompare(right.tariffCode);
}

function compareSourceDocuments(left: SourceDocumentMetadataV1, right: SourceDocumentMetadataV1): number {
  return left.sha256.localeCompare(right.sha256) || (left.fileName ?? "").localeCompare(right.fileName ?? "");
}

function formatRulesetDate(value: string): string {
  const date = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (date) return `${date[1]}_${date[2]}_${date[3]}`;
  return value.replace(/\W+/g, "_").replace(/^_+|_+$/g, "").toUpperCase() || "UNKNOWN";
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)])
    );
  }
  return value;
}
