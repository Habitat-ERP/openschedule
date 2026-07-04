#!/usr/bin/env node
import { constants } from "node:fs";
import { access, mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { parseArgs, type ParseArgsConfig } from "node:util";
import { pathToFileURL } from "node:url";
import {
  RulesetDiffV1Schema,
  RulesetManifestV1Schema,
  SourceDocumentMetadataV1Schema,
  SourceTraceV1Schema,
  ValidationReportV1Schema
} from "@openschedule/core";
import {
  CustomsSourceStatusV1Schema,
  discoverCustomsSources,
  fetchCustomsSources,
  checkCustomsSources,
  CustomsSourceV1Schema,
  FetchedCustomsSourceV1Schema
} from "@openschedule/za-sars";
import {
  buildCustomsRulesetFromPdf,
  createSchedule1QaReport,
  diffCustomsRulesets,
  estimateCustomsDuty,
  findTariffLine,
  inspectSchedule1TariffLines,
  listRateOptions,
  validateCustomsRuleset,
  CustomsDutyEstimateV1Schema,
  CustomsRulesetV1Schema,
  CUSTOMS_RATE_COLUMNS,
  Schedule1ParseResultV1Schema,
  Schedule1QaReportV1Schema,
  TariffLineV1Schema,
  type CustomsRateColumnV1,
  type CustomsRulesetV1,
  type Schedule1ParseResultV1,
  type Schedule1QaSource
} from "@openschedule/za-customs";

type Write = (text: string) => void;

export interface CliRuntime {
  stdout?: Write;
  stderr?: Write;
  fetch?: typeof fetch;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

class UsageError extends Error {}
class OperationalError extends Error {}

export async function runCli(args = process.argv.slice(2), runtime: CliRuntime = {}): Promise<number> {
  const stdout = runtime.stdout ?? ((text) => process.stdout.write(text));
  const stderr = runtime.stderr ?? ((text) => process.stderr.write(text));

  try {
    const [command, ...rest] = args;
    if (!command || command === "help" || command === "--help" || command === "-h") {
      stderr(usage());
      return command ? 0 : 2;
    }

    switch (command) {
      case "discover":
        writeJson(stdout, runDiscover(rest));
        return 0;
      case "fetch":
        writeJson(stdout, await runFetch(rest, runtime.fetch));
        return 0;
      case "status":
        writeJson(stdout, await runStatus(rest, runtime.fetch));
        return 0;
      case "build":
        writeJson(stdout, await runBuild(rest));
        return 0;
      case "diff":
        writeJson(stdout, await runDiff(rest));
        return 0;
      case "lookup":
        writeJson(stdout, await runLookup(rest));
        return 0;
      case "rates":
        writeJson(stdout, await runRates(rest));
        return 0;
      case "estimate": {
        const estimate = await runEstimate(rest);
        for (const warning of estimate.warnings) stderr(`warning: ${warning}\n`);
        writeJson(stdout, estimate);
        return 0;
      }
      case "qa":
        writeJson(stdout, await runQa(rest));
        return 0;
      case "schemas":
        writeJson(stdout, runSchemas(rest));
        return 0;
      default:
        throw new UsageError(`Unknown command: ${command}`);
    }
  } catch (error) {
    if (error instanceof UsageError) {
      stderr(`usage error: ${error.message}\n\n${usage()}`);
      return 2;
    }
    stderr(`error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

function runDiscover(args: string[]): unknown {
  requirePositionals(args, ["za-sars", "customs"], "discover za-sars customs");
  return discoverCustomsSources();
}

async function runFetch(args: string[], fetcher?: typeof fetch): Promise<unknown> {
  const { values, positionals } = parseOptions(args, {
    out: { type: "string" }
  });
  requirePositionals(positionals, ["za-sars", "customs"], "fetch za-sars customs --out <dir>");
  const outDir = stringOption(values.out, "--out");
  return fetchCustomsSources({ outDir, fetch: fetcher });
}

async function runStatus(args: string[], fetcher?: typeof fetch): Promise<unknown> {
  const { values, positionals } = parseOptions(args, {
    cache: { type: "string" }
  });
  requirePositionals(positionals, ["za-sars", "customs"], "status za-sars customs --cache <dir>");
  return checkCustomsSources({ cacheDir: stringOption(values.cache, "--cache"), fetch: fetcher });
}

async function runBuild(args: string[]): Promise<CustomsRulesetV1> {
  const { values, positionals } = parseOptions(args, {
    sources: { type: "string" },
    out: { type: "string" },
    "effective-date": { type: "string" },
    pages: { type: "string" }
  });
  requirePositionals(positionals, ["za-customs"], "build za-customs --sources <dir|pdf> --out <file>");

  const pdfPath = await resolveSinglePdf(stringOption(values.sources, "--sources"));
  const outputPath = stringOption(values.out, "--out");
  const effectiveDate = optionalDateOption(values["effective-date"], "--effective-date");
  const metadata = await readOptionalJson(`${pdfPath}.metadata.json`);
  const ruleset = await buildCustomsRulesetFromPdf({
    pdfPath,
    pages: optionalPages(values.pages),
    sourceUrl: typeof metadata?.sourceUrl === "string" ? metadata.sourceUrl : null,
    retrievedAt: typeof metadata?.retrievedAt === "string" ? metadata.retrievedAt : null,
    effectiveDate
  });

  if (!ruleset.tariffLines.length) {
    throw new OperationalError(`No tariff lines were parsed from ${pdfPath}.`);
  }
  assertValidRuleset(ruleset, outputPath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(ruleset, null, 2)}\n`, "utf8");
  return ruleset;
}

async function runDiff(args: string[]): Promise<unknown> {
  if (args.length !== 2) throw new UsageError("diff requires <old-ruleset.json> <new-ruleset.json>.");
  const before = await readRuleset(args[0]);
  const after = await readRuleset(args[1]);
  return diffCustomsRulesets(before, after);
}

async function runLookup(args: string[]): Promise<unknown> {
  const { values, positionals } = parseOptions(args, {
    "tariff-code": { type: "string" }
  });
  if (positionals.length !== 1) throw new UsageError("lookup requires <ruleset.json>.");
  const tariffCode = stringOption(values["tariff-code"], "--tariff-code");
  const ruleset = await readRuleset(positionals[0]);
  const line = findTariffLine(ruleset, tariffCode);
  if (!line) throw new OperationalError(`No tariff line found for ${tariffCode}.`);
  return line;
}

async function runRates(args: string[]): Promise<unknown> {
  const { values, positionals } = parseOptions(args, {
    "tariff-code": { type: "string" }
  });
  if (positionals.length !== 1) throw new UsageError("rates requires <ruleset.json>.");
  const tariffCode = stringOption(values["tariff-code"], "--tariff-code");
  const ruleset = await readRuleset(positionals[0]);
  if (!findTariffLine(ruleset, tariffCode)) throw new OperationalError(`No tariff line found for ${tariffCode}.`);
  const options = listRateOptions(ruleset, tariffCode);
  if (!options.length) throw new OperationalError(`No rate options found for ${tariffCode}.`);
  return options;
}

async function runEstimate(args: string[]): Promise<ReturnType<typeof estimateCustomsDuty>> {
  const { values, positionals } = parseOptions(args, {
    "tariff-code": { type: "string" },
    "effective-date": { type: "string" },
    "customs-value": { type: "string" },
    quantity: { type: "string" },
    "quantity-unit": { type: "string" },
    "rate-column": { type: "string" }
  });
  if (positionals.length !== 1) throw new UsageError("estimate requires <ruleset.json>.");

  const rateColumn = optionalRateColumn(values["rate-column"]);
  return estimateCustomsDuty({
    ruleset: await readRuleset(positionals[0]),
    tariffCode: stringOption(values["tariff-code"], "--tariff-code"),
    effectiveDate: dateOption(values["effective-date"], "--effective-date"),
    customsValue: optionalNumber(values["customs-value"], "--customs-value"),
    quantity: optionalNumber(values.quantity, "--quantity"),
    quantityUnit: optionalString(values["quantity-unit"]),
    rateColumn
  });
}

async function runQa(args: string[]): Promise<unknown> {
  const [subcommand, ...rest] = args;
  if (subcommand === "inspect") return runQaInspect(rest);
  if (subcommand === "report") return runQaReport(rest);
  throw new UsageError("qa requires inspect or report.");
}

async function runQaInspect(args: string[]): Promise<unknown> {
  const { values, positionals } = parseOptions(args, {
    "tariff-code": { type: "string", multiple: true }
  });
  if (positionals.length !== 1) throw new UsageError("qa inspect requires <ruleset-or-parse-result.json>.");
  return inspectSchedule1TariffLines(
    await readQaSource(positionals[0]),
    stringOptions(values["tariff-code"], "--tariff-code")
  );
}

async function runQaReport(args: string[]): Promise<unknown> {
  const { values, positionals } = parseOptions(args, {
    "low-confidence": { type: "string" },
    "high-rejection-page": { type: "string" }
  });
  if (positionals.length !== 1) throw new UsageError("qa report requires <ruleset-or-parse-result.json>.");
  return createSchedule1QaReport(await readQaSource(positionals[0]), {
    lowConfidenceThreshold: optionalFraction(values["low-confidence"], "--low-confidence") ?? undefined,
    highRejectionPageThreshold: optionalInteger(values["high-rejection-page"], "--high-rejection-page") ?? undefined
  });
}

function runSchemas(args: string[]): unknown {
  if (args.length < 1 || args.length > 2) throw new UsageError("schemas requires <core|za-sars|za-customs> [schema-name].");
  const schemas = schemaGroups()[args[0]];
  if (!schemas) throw new UsageError(`Unknown schema group: ${args[0]}`);
  if (!args[1]) return schemas;
  const schema = schemas[args[1]];
  if (!schema) throw new UsageError(`Unknown ${args[0]} schema: ${args[1]}`);
  return schema;
}

function parseOptions(
  args: string[],
  options: NonNullable<ParseArgsConfig["options"]>
): { values: Record<string, string | boolean | Array<string | boolean> | undefined>; positionals: string[] } {
  try {
    const parsed = parseArgs({ args, options, allowPositionals: true, strict: true });
    return {
      values: parsed.values,
      positionals: parsed.positionals
    };
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
}

function requirePositionals(actual: readonly string[], expected: readonly string[], syntax: string): void {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new UsageError(`Expected: openschedule ${syntax}`);
  }
}

async function readRuleset(path: string): Promise<CustomsRulesetV1> {
  const ruleset = (await readJson(path)) as CustomsRulesetV1;
  assertValidRuleset(ruleset, path);
  return ruleset;
}

async function readQaSource(path: string): Promise<Schedule1QaSource> {
  const source = await readJson(path);
  if (isCustomsRuleset(source)) {
    assertValidRuleset(source, path);
    return source;
  }
  if (isSchedule1ParseResult(source)) return source;
  throw new OperationalError(`${path} is not a customs ruleset or Schedule 1 parse result.`);
}

function assertValidRuleset(ruleset: CustomsRulesetV1, label: string): void {
  const report = validateCustomsRuleset(ruleset);
  if (!report.valid) {
    throw new OperationalError(
      `${label} is not a valid customs ruleset: ${report.issues.map((issue) => issue.code).join(", ")}`
    );
  }
}

async function resolveSinglePdf(sourcePath: string): Promise<string> {
  const sourceStat = await stat(sourcePath);
  if (sourceStat.isFile()) {
    if (!sourcePath.toLowerCase().endsWith(".pdf")) throw new OperationalError(`${sourcePath} is not a PDF file.`);
    return sourcePath;
  }
  if (!sourceStat.isDirectory()) throw new OperationalError(`${sourcePath} is not a file or directory.`);

  const pdfs = (await readdir(sourcePath))
    .filter((entry) => entry.toLowerCase().endsWith(".pdf"))
    .map((entry) => join(sourcePath, entry))
    .sort();
  if (!pdfs.length) throw new OperationalError(`No PDF files found directly in ${sourcePath}.`);
  if (pdfs.length > 1) throw new OperationalError(`Multiple PDF files found in ${sourcePath}; pass a PDF path instead.`);
  return pdfs[0];
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new OperationalError(`Failed to read JSON from ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readOptionalJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    await access(path, constants.R_OK);
  } catch {
    return null;
  }
  return (await readJson(path)) as Record<string, unknown>;
}

function stringOption(value: unknown, name: string): string {
  if (typeof value !== "string" || !value) throw new UsageError(`${name} is required.`);
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function dateOption(value: unknown, name: string): string {
  const date = stringOption(value, name);
  if (!DATE_PATTERN.test(date)) throw new UsageError(`${name} must be YYYY-MM-DD.`);
  return date;
}

function optionalDateOption(value: unknown, name: string): string | null {
  if (value === undefined) return null;
  return dateOption(value, name);
}

function optionalNumber(value: unknown, name: string): number | null {
  if (value === undefined) return null;
  if (typeof value !== "string" || !value) throw new UsageError(`${name} must be a number.`);
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new UsageError(`${name} must be a non-negative number.`);
  return number;
}

function optionalInteger(value: unknown, name: string): number | null {
  const number = optionalNumber(value, name);
  if (number === null) return null;
  if (!Number.isInteger(number)) throw new UsageError(`${name} must be an integer.`);
  return number;
}

function optionalFraction(value: unknown, name: string): number | null {
  const number = optionalNumber(value, name);
  if (number === null) return null;
  if (number > 1) throw new UsageError(`${name} must be between 0 and 1.`);
  return number;
}

function stringOptions(value: unknown, name: string): string[] {
  if (typeof value === "string" && value) return [value];
  if (Array.isArray(value) && value.every((item) => typeof item === "string" && item)) return value;
  throw new UsageError(`${name} is required.`);
}

function optionalRateColumn(value: unknown): CustomsRateColumnV1 | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !CUSTOMS_RATE_COLUMNS.includes(value as CustomsRateColumnV1)) {
    throw new UsageError(`--rate-column must be one of: ${CUSTOMS_RATE_COLUMNS.join(", ")}.`);
  }
  return value as CustomsRateColumnV1;
}

function optionalPages(value: unknown): number[] | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value) throw new UsageError("--pages must be a comma-separated list of page numbers.");
  const pages = value.split(",").map((page) => Number(page.trim()));
  if (pages.some((page) => !Number.isInteger(page) || page < 1)) {
    throw new UsageError("--pages must be a comma-separated list of positive integers.");
  }
  return pages;
}

function writeJson(stdout: Write, value: unknown): void {
  stdout(`${JSON.stringify(value, null, 2)}\n`);
}

function schemaGroups(): Record<string, Record<string, unknown>> {
  return {
    core: {
      "ruleset-manifest": RulesetManifestV1Schema,
      "ruleset-diff": RulesetDiffV1Schema,
      "source-document-metadata": SourceDocumentMetadataV1Schema,
      "source-trace": SourceTraceV1Schema,
      "validation-report": ValidationReportV1Schema
    },
    "za-sars": {
      "customs-source": CustomsSourceV1Schema,
      "customs-source-status": CustomsSourceStatusV1Schema,
      "fetched-customs-source": FetchedCustomsSourceV1Schema
    },
    "za-customs": {
      "duty-estimate": CustomsDutyEstimateV1Schema,
      "customs-ruleset": CustomsRulesetV1Schema,
      "schedule1-parse-result": Schedule1ParseResultV1Schema,
      "schedule1-qa-report": Schedule1QaReportV1Schema,
      "tariff-line": TariffLineV1Schema
    }
  };
}

function usage(): string {
  return `Usage:
  openschedule discover za-sars customs
  openschedule fetch za-sars customs --out <dir>
  openschedule status za-sars customs --cache <dir>
  openschedule build za-customs --sources <dir|pdf> --out <file> [--effective-date YYYY-MM-DD] [--pages 1,2]
  openschedule diff <old-ruleset.json> <new-ruleset.json>
  openschedule lookup <ruleset.json> --tariff-code <code>
  openschedule rates <ruleset.json> --tariff-code <code>
  openschedule estimate <ruleset.json> --tariff-code <code> --effective-date YYYY-MM-DD [--customs-value n] [--quantity n --quantity-unit unit] [--rate-column ${CUSTOMS_RATE_COLUMNS.join("|")}]
  openschedule qa inspect <ruleset-or-parse-result.json> --tariff-code <code> [--tariff-code <code>]
  openschedule qa report <ruleset-or-parse-result.json> [--low-confidence n] [--high-rejection-page n]
  openschedule schemas <core|za-sars|za-customs> [schema-name]
`;
}

function isCustomsRuleset(value: unknown): value is CustomsRulesetV1 {
  return Boolean(value && typeof value === "object" && (value as CustomsRulesetV1).schemaVersion === "za-customs.customs-ruleset.v1");
}

function isSchedule1ParseResult(value: unknown): value is Schedule1ParseResultV1 {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as Schedule1ParseResultV1).schemaVersion === "za-customs.schedule1-parse-result.v1"
  );
}

if (await isDirectRun()) {
  process.exitCode = await runCli();
}

async function isDirectRun(): Promise<boolean> {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(await realpath(process.argv[1])).href;
}
