#!/usr/bin/env node
import { constants } from "node:fs";
import { access, mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
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
  CustomsSourceV1Schema,
  FetchedCustomsSourceV1Schema,
  checkCustomsSources,
  discoverCustomsSources,
  fetchCustomsSources
} from "@openschedule/za-sars";
import {
  createZaCustoms,
  type ZaCustomsEffectiveDate,
  type ZaCustomsMeasureFilter,
  type ZaCustomsSyncMode
} from "@openschedule/za-customs";
import {
  CUSTOMS_RATE_COLUMNS,
  CustomsDutyEstimateV1Schema,
  CustomsRulesetContainerV1Schema,
  CustomsRulesetV1Schema,
  Schedule1ParseResultV1Schema,
  Schedule1ExciseLeviesParseResultV1Schema,
  Schedule2ParseResultV1Schema,
  Schedule3ParseResultV1Schema,
  Schedule4ParseResultV1Schema,
  Schedule5ParseResultV1Schema,
  Schedule6ParseResultV1Schema,
  Schedule1QaReportV1Schema,
  ScheduleFamilyQaReportV1Schema,
  TariffLineV1Schema,
  buildCustomsRulesetFromPdf,
  diffCustomsRulesets,
  estimateCustomsDuty,
  findTariffLine,
  listRateOptions,
  validateCustomsRuleset,
  type CustomsRateColumnV1,
  type CustomsRulesetV1
} from "@openschedule/za-customs/internal";

type JsonRpcId = string | number | null;
type JsonObject = Record<string, unknown>;

export interface McpRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method?: string;
  params?: JsonObject;
}

export interface McpRuntime {
  fetch?: typeof fetch;
}

const PROTOCOL_VERSION = "2025-06-18";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CUSTOMS_MEASURE_KINDS = [
  "ordinary-duty",
  "excise-levy",
  "trade-remedy",
  "rebate",
  "drawback",
  "refund",
  "drawback-or-refund"
] as const;

const SCHEMAS: Record<string, unknown> = {
  "openschedule://schemas/core/ruleset-manifest.v1": RulesetManifestV1Schema,
  "openschedule://schemas/core/ruleset-diff.v1": RulesetDiffV1Schema,
  "openschedule://schemas/core/source-document-metadata.v1": SourceDocumentMetadataV1Schema,
  "openschedule://schemas/core/source-trace.v1": SourceTraceV1Schema,
  "openschedule://schemas/core/validation-report.v1": ValidationReportV1Schema,
  "openschedule://schemas/za-sars/customs-source.v1": CustomsSourceV1Schema,
  "openschedule://schemas/za-sars/customs-source-status.v1": CustomsSourceStatusV1Schema,
  "openschedule://schemas/za-sars/fetched-customs-source.v1": FetchedCustomsSourceV1Schema,
  "openschedule://schemas/za-customs/duty-estimate.v1": CustomsDutyEstimateV1Schema,
  "openschedule://schemas/za-customs/customs-ruleset-container.v1": CustomsRulesetContainerV1Schema,
  "openschedule://schemas/za-customs/customs-ruleset.v1": CustomsRulesetV1Schema,
  "openschedule://schemas/za-customs/schedule1-parse-result.v1": Schedule1ParseResultV1Schema,
  "openschedule://schemas/za-customs/schedule1-excise-levies-parse-result.v1": Schedule1ExciseLeviesParseResultV1Schema,
  "openschedule://schemas/za-customs/schedule2-parse-result.v1": Schedule2ParseResultV1Schema,
  "openschedule://schemas/za-customs/schedule3-parse-result.v1": Schedule3ParseResultV1Schema,
  "openschedule://schemas/za-customs/schedule4-parse-result.v1": Schedule4ParseResultV1Schema,
  "openschedule://schemas/za-customs/schedule5-parse-result.v1": Schedule5ParseResultV1Schema,
  "openschedule://schemas/za-customs/schedule6-parse-result.v1": Schedule6ParseResultV1Schema,
  "openschedule://schemas/za-customs/schedule1-qa-report.v1": Schedule1QaReportV1Schema,
  "openschedule://schemas/za-customs/schedule-family-qa-report.v1": ScheduleFamilyQaReportV1Schema,
  "openschedule://schemas/za-customs/tariff-line.v1": TariffLineV1Schema
};

const CUSTOMS_CLIENT_PROPERTIES = {
  cacheDir: { type: "string", minLength: 1 },
  sync: { enum: ["never", "if-missing", "if-stale", "always"] },
  effectiveDate: { type: "string", pattern: `^(${DATE_PATTERN.source}|latest)$` }
};

const METADATA_PROPERTY = {
  includeMetadata: { type: "boolean" }
};

const TOOLS = [
  tool("discover_sources", "Discover supported official source descriptors.", {
    type: "object",
    additionalProperties: false,
    properties: {}
  }, true),
  tool("fetch_sources", "Fetch supported official source documents into an explicit output directory.", {
    type: "object",
    additionalProperties: false,
    required: ["outDir"],
    properties: {
      outDir: { type: "string", minLength: 1 }
    }
  }, false),
  tool("check_source_status", "Check declared official sources against a local fetched source cache.", {
    type: "object",
    additionalProperties: false,
    required: ["cacheDir"],
    properties: {
      cacheDir: { type: "string", minLength: 1 }
    }
  }, true),
  tool("za_customs_sync", "Fetch/build/update the managed ZA customs cache.", {
    type: "object",
    additionalProperties: false,
    properties: CUSTOMS_CLIENT_PROPERTIES
  }, false),
  tool("za_customs_lookup", "Look up one tariff line from the managed ZA customs cache.", {
    type: "object",
    additionalProperties: false,
    required: ["tariffCode"],
    properties: {
      ...CUSTOMS_CLIENT_PROPERTIES,
      ...METADATA_PROPERTY,
      tariffCode: { type: "string", minLength: 1 }
    }
  }, true),
  tool("za_customs_rates", "List available rate columns for one tariff line from the managed ZA customs cache.", {
    type: "object",
    additionalProperties: false,
    required: ["tariffCode"],
    properties: {
      ...CUSTOMS_CLIENT_PROPERTIES,
      ...METADATA_PROPERTY,
      tariffCode: { type: "string", minLength: 1 }
    }
  }, true),
  tool("za_customs_estimate", "Estimate customs duty from the managed ZA customs cache.", {
    type: "object",
    additionalProperties: false,
    required: ["tariffCode"],
    properties: {
      ...CUSTOMS_CLIENT_PROPERTIES,
      ...METADATA_PROPERTY,
      tariffCode: { type: "string", minLength: 1 },
      customsValue: { type: "number", minimum: 0 },
      quantity: { type: "number", minimum: 0 },
      quantityUnit: { type: "string", minLength: 1 },
      rateColumn: { enum: [...CUSTOMS_RATE_COLUMNS] }
    }
  }, true),
  tool("za_customs_source", "Return source trace and source document references for one tariff line.", {
    type: "object",
    additionalProperties: false,
    required: ["tariffCode"],
    properties: {
      ...CUSTOMS_CLIENT_PROPERTIES,
      tariffCode: { type: "string", minLength: 1 }
    }
  }, true),
  tool("za_customs_measures", "List duties, remedies, rebates, drawbacks, and refunds from the managed ZA customs cache.", {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CUSTOMS_CLIENT_PROPERTIES,
      ...METADATA_PROPERTY,
      kind: { type: "array", items: { type: "string" } },
      tariffCode: { type: "string", minLength: 1 },
      tariffPrefix: { type: "string", minLength: 1 },
      item: { type: "string", minLength: 1 },
      code: { type: "string", minLength: 1 },
      origin: { type: "string", minLength: 1 },
      limit: { type: "integer", minimum: 1 },
      cursor: { type: "string", minLength: 1 }
    }
  }, true),
  tool("za_customs_duties", "List duty-like measures from the managed ZA customs cache.", {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CUSTOMS_CLIENT_PROPERTIES,
      ...METADATA_PROPERTY,
      tariffCode: { type: "string", minLength: 1 },
      tariffPrefix: { type: "string", minLength: 1 },
      limit: { type: "integer", minimum: 1 },
      cursor: { type: "string", minLength: 1 }
    }
  }, true),
  tool("za_customs_reliefs", "List rebate, drawback, and refund measures from the managed ZA customs cache.", {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CUSTOMS_CLIENT_PROPERTIES,
      ...METADATA_PROPERTY,
      tariffCode: { type: "string", minLength: 1 },
      tariffPrefix: { type: "string", minLength: 1 },
      item: { type: "string", minLength: 1 },
      code: { type: "string", minLength: 1 },
      limit: { type: "integer", minimum: 1 },
      cursor: { type: "string", minLength: 1 }
    }
  }, true),
  tool("build_ruleset", "Build a customs ruleset from one PDF path or one direct PDF inside a source directory.", {
    type: "object",
    additionalProperties: false,
    required: ["sourcePath"],
    properties: {
      sourcePath: { type: "string", minLength: 1 },
      outPath: { type: "string", minLength: 1 },
      effectiveDate: { type: "string", pattern: DATE_PATTERN.source },
      pages: { type: "array", items: { type: "integer", minimum: 1 } }
    }
  }, false),
  tool("validate_ruleset", "Validate a customs ruleset JSON file.", {
    type: "object",
    additionalProperties: false,
    required: ["rulesetPath"],
    properties: {
      rulesetPath: { type: "string", minLength: 1 }
    }
  }, true),
  tool("diff_rulesets", "Diff two customs ruleset JSON files.", {
    type: "object",
    additionalProperties: false,
    required: ["beforePath", "afterPath"],
    properties: {
      beforePath: { type: "string", minLength: 1 },
      afterPath: { type: "string", minLength: 1 }
    }
  }, true),
  tool("lookup_tariff_line", "Look up one exact tariff line.", {
    type: "object",
    additionalProperties: false,
    required: ["rulesetPath", "tariffCode"],
    properties: {
      rulesetPath: { type: "string", minLength: 1 },
      tariffCode: { type: "string", minLength: 1 }
    }
  }, true),
  tool("list_rate_options", "List available rate columns for one exact tariff line.", {
    type: "object",
    additionalProperties: false,
    required: ["rulesetPath", "tariffCode"],
    properties: {
      rulesetPath: { type: "string", minLength: 1 },
      tariffCode: { type: "string", minLength: 1 }
    }
  }, true),
  tool("estimate_customs_duty", "Estimate customs duty using mechanically resolvable rate text.", {
    type: "object",
    additionalProperties: false,
    required: ["rulesetPath", "tariffCode", "effectiveDate"],
    properties: {
      rulesetPath: { type: "string", minLength: 1 },
      tariffCode: { type: "string", minLength: 1 },
      effectiveDate: { type: "string", pattern: DATE_PATTERN.source },
      customsValue: { type: "number", minimum: 0 },
      quantity: { type: "number", minimum: 0 },
      quantityUnit: { type: "string", minLength: 1 },
      rateColumn: { enum: [...CUSTOMS_RATE_COLUMNS] }
    }
  }, true),
  tool("list_schemas", "List OpenSchedule schema resource URIs.", {
    type: "object",
    additionalProperties: false,
    properties: {}
  }, true),
  tool("get_schema", "Read one OpenSchedule schema by resource URI.", {
    type: "object",
    additionalProperties: false,
    required: ["uri"],
    properties: {
      uri: { type: "string", minLength: 1 }
    }
  }, true)
] as const;

export async function handleMcpRequest(request: McpRequest, runtime: McpRuntime = {}): Promise<JsonObject | null> {
  if (request.jsonrpc !== "2.0" || !request.method) return errorResponse(request.id ?? null, -32600, "Invalid Request");

  try {
    switch (request.method) {
      case "initialize":
        return resultResponse(request.id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {
            tools: {},
            resources: {}
          },
          serverInfo: {
            name: "openschedule",
            version: "0.0.0"
          }
        });
      case "notifications/initialized":
        return null;
      case "ping":
        return resultResponse(request.id, {});
      case "tools/list":
        return resultResponse(request.id, { tools: TOOLS });
      case "tools/call":
        return resultResponse(request.id, await callTool(request.params, runtime));
      case "resources/list":
        return resultResponse(request.id, { resources: schemaResources() });
      case "resources/templates/list":
        return resultResponse(request.id, { resourceTemplates: [] });
      case "resources/read":
        return resultResponse(request.id, readResource(request.params));
      default:
        return errorResponse(request.id, -32601, `Method not found: ${request.method}`);
    }
  } catch (error) {
    return errorResponse(request.id, -32603, error instanceof Error ? error.message : String(error));
  }
}

export async function startStdioServer(runtime: McpRuntime = {}): Promise<void> {
  const lines = createInterface({ input: process.stdin, terminal: false });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const response = await handleMcpRequest(JSON.parse(line) as McpRequest, runtime);
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  }
}

async function callTool(params: unknown, runtime: McpRuntime): Promise<JsonObject> {
  const toolParams = objectParam(params, "params");
  const name = stringParam(toolParams.name, "name");
  const args = objectParam(toolParams.arguments ?? {}, "arguments");

  switch (name) {
    case "discover_sources":
      return toolResult(discoverCustomsSources());
    case "fetch_sources":
      return toolResult(await fetchCustomsSources({ outDir: stringParam(args.outDir, "outDir"), fetch: runtime.fetch }));
    case "check_source_status":
      return toolResult(await checkCustomsSources({ cacheDir: stringParam(args.cacheDir, "cacheDir"), fetch: runtime.fetch }));
    case "za_customs_sync": {
      const effectiveDate = optionalEffectiveDate(args.effectiveDate);
      const customs = await createZaCustoms({
        cacheDir: optionalString(args.cacheDir) ?? undefined,
        sync: optionalSyncMode(args.sync) ?? "always",
        effectiveDate,
        fetch: runtime.fetch
      });
      return toolResult(await customs.sync({
        mode: "never",
        effectiveDate
      }));
    }
    case "za_customs_lookup": {
      const tariffCode = stringParam(args.tariffCode, "tariffCode");
      const line = (await createCustomsClient(args, runtime)).lookup(tariffCode, metadataOption(args));
      if (!line) throw new Error(`No tariff line found for ${tariffCode}.`);
      return toolResult(line);
    }
    case "za_customs_rates": {
      const tariffCode = stringParam(args.tariffCode, "tariffCode");
      const rates = (await createCustomsClient(args, runtime)).rates(tariffCode, metadataOption(args));
      if (!rates.length) throw new Error(`No rate options found for ${tariffCode}.`);
      return toolResult(rates);
    }
    case "za_customs_estimate":
      return toolResult(
        (await createCustomsClient(args, runtime)).estimate({
          tariffCode: stringParam(args.tariffCode, "tariffCode"),
          effectiveDate: estimateEffectiveDate(args.effectiveDate),
          customsValue: optionalNumber(args.customsValue, "customsValue"),
          quantity: optionalNumber(args.quantity, "quantity"),
          quantityUnit: optionalString(args.quantityUnit),
          rateColumn: optionalRateColumn(args.rateColumn),
          includeMetadata: optionalBoolean(args.includeMetadata, "includeMetadata")
        })
      );
    case "za_customs_source":
      return toolResult((await createCustomsClient(args, runtime)).source(stringParam(args.tariffCode, "tariffCode")));
    case "za_customs_measures":
      return toolResult((await createCustomsClient(args, runtime)).measures(measureFilter(args)));
    case "za_customs_duties":
      return toolResult((await createCustomsClient(args, runtime)).duties(measureFilter(args)));
    case "za_customs_reliefs":
      return toolResult((await createCustomsClient(args, runtime)).reliefs(measureFilter(args)));
    case "build_ruleset":
      return toolResult(await buildRuleset(args));
    case "validate_ruleset":
      return toolResult(validateCustomsRuleset(await readRuleset(stringParam(args.rulesetPath, "rulesetPath"), false)));
    case "diff_rulesets":
      return toolResult(
        diffCustomsRulesets(
          await readRuleset(stringParam(args.beforePath, "beforePath")),
          await readRuleset(stringParam(args.afterPath, "afterPath"))
        )
      );
    case "lookup_tariff_line": {
      const line = findTariffLine(await readRuleset(stringParam(args.rulesetPath, "rulesetPath")), stringParam(args.tariffCode, "tariffCode"));
      if (!line) throw new Error(`No tariff line found for ${String(args.tariffCode)}.`);
      return toolResult(line);
    }
    case "list_rate_options":
      return toolResult(listRateOptions(await readRuleset(stringParam(args.rulesetPath, "rulesetPath")), stringParam(args.tariffCode, "tariffCode")));
    case "estimate_customs_duty":
      return toolResult(
        estimateCustomsDuty({
          ruleset: await readRuleset(stringParam(args.rulesetPath, "rulesetPath")),
          tariffCode: stringParam(args.tariffCode, "tariffCode"),
          effectiveDate: dateParam(args.effectiveDate, "effectiveDate"),
          customsValue: optionalNumber(args.customsValue, "customsValue"),
          quantity: optionalNumber(args.quantity, "quantity"),
          quantityUnit: optionalString(args.quantityUnit),
          rateColumn: optionalRateColumn(args.rateColumn)
        })
      );
    case "list_schemas":
      return toolResult(schemaResources());
    case "get_schema":
      return toolResult(schemaByUri(stringParam(args.uri, "uri")));
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function createCustomsClient(args: JsonObject, runtime: McpRuntime) {
  return createZaCustoms({
    cacheDir: optionalString(args.cacheDir) ?? undefined,
    sync: optionalSyncMode(args.sync),
    effectiveDate: optionalEffectiveDate(args.effectiveDate),
    fetch: runtime.fetch
  });
}

function metadataOption(args: JsonObject): { includeMetadata: boolean } {
  return { includeMetadata: optionalBoolean(args.includeMetadata, "includeMetadata") };
}

function measureFilter(args: JsonObject): ZaCustomsMeasureFilter {
  return {
    kind: optionalMeasureKinds(args.kind),
    tariffCode: optionalString(args.tariffCode) ?? undefined,
    tariffPrefix: optionalString(args.tariffPrefix) ?? undefined,
    item: optionalString(args.item) ?? undefined,
    code: optionalString(args.code) ?? undefined,
    origin: optionalString(args.origin) ?? undefined,
    effectiveDate: estimateEffectiveDate(args.effectiveDate),
    limit: optionalInteger(args.limit, "limit") ?? undefined,
    cursor: optionalString(args.cursor) ?? undefined,
    includeMetadata: optionalBoolean(args.includeMetadata, "includeMetadata")
  };
}

async function buildRuleset(args: JsonObject): Promise<CustomsRulesetV1> {
  const pdfPath = await resolveSinglePdf(stringParam(args.sourcePath, "sourcePath"));
  const metadata = await readOptionalJson(`${pdfPath}.metadata.json`);
  const ruleset = await buildCustomsRulesetFromPdf({
    pdfPath,
    pages: optionalPages(args.pages),
    sourceUrl: optionalString(metadata?.sourceUrl),
    sourceIdentifier: optionalString(metadata?.sourceIdentifier),
    sourceRole: optionalString(metadata?.sourceRole),
    publishedDate: optionalString(metadata?.publishedDate),
    sourceDocumentEffectiveDate: optionalString(metadata?.effectiveDate),
    supersedes: optionalStringArray(metadata?.supersedes),
    supersededBy: optionalStringArray(metadata?.supersededBy),
    retrievedAt: optionalString(metadata?.retrievedAt),
    effectiveDate: args.effectiveDate === undefined ? null : dateParam(args.effectiveDate, "effectiveDate")
  });
  if (!ruleset.tariffLines.length) throw new Error(`No tariff lines were parsed from ${pdfPath}.`);
  assertValidRuleset(ruleset, pdfPath);
  if (args.outPath !== undefined) {
    const outPath = stringParam(args.outPath, "outPath");
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(ruleset, null, 2)}\n`, "utf8");
  }
  return ruleset;
}

async function readRuleset(path: string, requireValid = true): Promise<CustomsRulesetV1> {
  const ruleset = (await readJson(path)) as CustomsRulesetV1;
  if (requireValid) assertValidRuleset(ruleset, path);
  return ruleset;
}

function assertValidRuleset(ruleset: CustomsRulesetV1, label: string): void {
  const report = validateCustomsRuleset(ruleset);
  if (!report.valid) throw new Error(`${label} is not a valid customs ruleset: ${report.issues.map((issue) => issue.code).join(", ")}`);
}

async function resolveSinglePdf(sourcePath: string): Promise<string> {
  const sourceStat = await stat(sourcePath);
  if (sourceStat.isFile()) {
    if (!sourcePath.toLowerCase().endsWith(".pdf")) throw new Error(`${sourcePath} is not a PDF file.`);
    return sourcePath;
  }
  if (!sourceStat.isDirectory()) throw new Error(`${sourcePath} is not a file or directory.`);
  const pdfs = (await readdir(sourcePath))
    .filter((entry) => entry.toLowerCase().endsWith(".pdf"))
    .map((entry) => join(sourcePath, entry))
    .sort();
  if (!pdfs.length) throw new Error(`No PDF files found directly in ${sourcePath}.`);
  if (pdfs.length > 1) throw new Error(`Multiple PDF files found in ${sourcePath}; pass a PDF path instead.`);
  return pdfs[0];
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readOptionalJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    await access(path, constants.R_OK);
  } catch {
    return null;
  }
  return (await readJson(path)) as Record<string, unknown>;
}

function readResource(params: unknown): JsonObject {
  const uri = stringParam(objectParam(params, "params").uri, "uri");
  return {
    contents: [
      {
        uri,
        mimeType: "application/schema+json",
        text: JSON.stringify(schemaByUri(uri), null, 2)
      }
    ]
  };
}

function schemaByUri(uri: string): unknown {
  const schema = SCHEMAS[uri];
  if (!schema) throw new Error(`Resource not found: ${uri}`);
  return schema;
}

function schemaResources(): JsonObject[] {
  return Object.keys(SCHEMAS).map((uri) => ({
    uri,
    name: uri.split("/").at(-1),
    mimeType: "application/schema+json"
  }));
}

function tool(name: string, description: string, inputSchema: JsonObject, readOnlyHint: boolean): JsonObject {
  return { name, description, inputSchema, annotations: { readOnlyHint } };
}

function toolResult(value: unknown): JsonObject {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError: false
  };
}

function resultResponse(id: JsonRpcId | undefined, result: unknown): JsonObject {
  return { jsonrpc: "2.0", id, result };
}

function errorResponse(id: JsonRpcId | undefined, code: number, message: string): JsonObject {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function objectParam(value: unknown, name: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object.`);
  return value as JsonObject;
}

function stringParam(value: unknown, name: string): string {
  if (typeof value !== "string" || !value) throw new Error(`${name} is required.`);
  return value;
}

function dateParam(value: unknown, name: string): string {
  const valueString = stringParam(value, name);
  if (!DATE_PATTERN.test(valueString)) throw new Error(`${name} must be YYYY-MM-DD.`);
  return valueString;
}

function estimateEffectiveDate(value: unknown): string | undefined {
  if (value === undefined || value === "latest") return undefined;
  return dateParam(value, "effectiveDate");
}

function optionalEffectiveDate(value: unknown): ZaCustomsEffectiveDate | undefined {
  if (value === undefined) return undefined;
  if (value === "latest") return "latest";
  return dateParam(value, "effectiveDate");
}

function optionalSyncMode(value: unknown): ZaCustomsSyncMode | undefined {
  if (value === undefined) return undefined;
  if (value === "never" || value === "if-missing" || value === "if-stale" || value === "always") return value;
  throw new Error("sync must be one of: never, if-missing, if-stale, always.");
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item) ? value : undefined;
}

function optionalNumber(value: unknown, name: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number.`);
  return value;
}

function optionalInteger(value: unknown, name: string): number | null {
  const number = optionalNumber(value, name);
  if (number === null) return null;
  if (!Number.isInteger(number)) throw new Error(`${name} must be an integer.`);
  return number;
}

function optionalBoolean(value: unknown, name: string): boolean {
  if (value === undefined) return false;
  if (typeof value !== "boolean") throw new Error(`${name} must be a boolean.`);
  return value;
}

function optionalPages(value: unknown): number[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((page) => !Number.isInteger(page) || page < 1)) {
    throw new Error("pages must be an array of positive integers.");
  }
  return value;
}

function optionalRateColumn(value: unknown): CustomsRateColumnV1 | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !CUSTOMS_RATE_COLUMNS.includes(value as CustomsRateColumnV1)) {
    throw new Error(`rateColumn must be one of: ${CUSTOMS_RATE_COLUMNS.join(", ")}.`);
  }
  return value as CustomsRateColumnV1;
}

function optionalMeasureKinds(value: unknown): ZaCustomsMeasureFilter["kind"] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item)) {
    throw new Error("kind must be an array of strings.");
  }
  for (const item of value) {
    if (!CUSTOMS_MEASURE_KINDS.includes(item as (typeof CUSTOMS_MEASURE_KINDS)[number])) {
      throw new Error(`kind must contain only: ${CUSTOMS_MEASURE_KINDS.join(", ")}.`);
    }
  }
  return value as ZaCustomsMeasureFilter["kind"];
}

if (await isDirectRun()) {
  await startStdioServer();
}

async function isDirectRun(): Promise<boolean> {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(await realpath(process.argv[1])).href;
}
