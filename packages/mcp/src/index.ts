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
  CUSTOMS_RATE_COLUMNS,
  CustomsDutyEstimateV1Schema,
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
} from "@openschedule/za-customs";

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

async function buildRuleset(args: JsonObject): Promise<CustomsRulesetV1> {
  const pdfPath = await resolveSinglePdf(stringParam(args.sourcePath, "sourcePath"));
  const metadata = await readOptionalJson(`${pdfPath}.metadata.json`);
  const ruleset = await buildCustomsRulesetFromPdf({
    pdfPath,
    pages: optionalPages(args.pages),
    sourceUrl: optionalString(metadata?.sourceUrl),
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

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function optionalNumber(value: unknown, name: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number.`);
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

if (await isDirectRun()) {
  await startStdioServer();
}

async function isDirectRun(): Promise<boolean> {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(await realpath(process.argv[1])).href;
}
