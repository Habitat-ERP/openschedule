import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ZA_CUSTOMS_MANIFEST_FILE, writeCacheArtifacts, zaCustomsCachePaths } from "../../za-customs/dist/src/cache-artifacts.js";
import { buildCustomsRuleset, buildCustomsRulesetContainer } from "../../za-customs/dist/src/internal.js";
import { syntheticSchedulePdf } from "../../za-customs/test/synthetic-schedule-pdf.mjs";
import PackageJson from "../package.json" with { type: "json" };
import { handleMcpRequest } from "../dist/src/index.js";

const sourceDocumentSha256 = "0".repeat(64);
const sourceDocument = {
  schemaVersion: "core.source-document-metadata.v1",
  sha256: sourceDocumentSha256,
  fileName: "schedule.pdf"
};
const sourceTrace = {
  schemaVersion: "core.source-trace.v1",
  sourceDocumentSha256,
  page: 1,
  locator: "synthetic fixture",
  text: "synthetic source text"
};

async function request(method, params = undefined, runtime = {}) {
  return handleMcpRequest({ jsonrpc: "2.0", id: 1, method, params }, runtime);
}

function toolCall(name, args, runtime = {}) {
  return request("tools/call", { name, arguments: args }, runtime);
}

function structured(response) {
  return response.result.structuredContent;
}

function rate(raw, kind, components = []) {
  return { raw, kind, components, warnings: [] };
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
      general: rate("10%", "ad_valorem", [{ basis: "customs_value", rate: 0.1 }]),
      sadc: rate("free", "free")
    },
    validFrom: "2026-05-29",
    sourceTrace: [sourceTrace],
    parseConfidence: 1,
    warnings: overrides.warnings ?? []
  };
}

function schedule1(lines) {
  return {
    schemaVersion: "za-customs.schedule1-parse-result.v1",
    tariffLines: lines,
    warnings: [],
    metrics: {
      pagesParsed: 1,
      textItems: 1,
      layoutRows: 1,
      candidateRows: lines.length,
      contextRows: 0,
      tariffLines: lines.length,
      rejectedRows: 0
    }
  };
}

function ruleset(lines) {
  return buildCustomsRuleset({
    parseResult: schedule1(lines),
    sourceDocuments: [sourceDocument],
    generatedAt: "2026-07-04T00:00:00.000Z",
    effectiveDate: "2026-05-29"
  });
}

function container(lines) {
  return buildCustomsRulesetContainer({
    manifest: {
      schemaVersion: "core.ruleset-manifest.v1",
      rulesetId: "",
      domain: "za-customs",
      country: "ZA",
      publisher: "SARS",
      generatedAt: "2026-07-04T00:00:00.000Z",
      effectiveDate: "2026-05-29",
      sourceDocuments: [sourceDocument],
      parser: { packageName: "@openschedule/za-customs", packageVersion: "0.0.0" },
      warnings: []
    },
    schedule1Part1: schedule1(lines)
  });
}

async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), "openschedule-mcp-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeRuleset(dir, name, value) {
  const path = join(dir, name);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return path;
}

async function writeCustomsCache(dir, value) {
  await writeCacheArtifacts(zaCustomsCachePaths(dir), value);
}

test("initializes and lists tools/resources", async () => {
  const initialized = await request("initialize");
  const tools = await request("tools/list");
  const resources = await request("resources/list");

  assert.equal(initialized.result.protocolVersion, "2025-06-18");
  assert.equal(initialized.result.serverInfo.version, PackageJson.version);
  assert.ok(tools.result.tools.some((tool) => tool.name === "za_customs_lookup"));
  assert.ok(tools.result.tools.some((tool) => tool.name === "za_customs_rates"));
  assert.ok(tools.result.tools.some((tool) => tool.name === "za_customs_estimate"));
  assert.ok(tools.result.tools.some((tool) => tool.name === "lookup_tariff_line"));
  assert.ok(tools.result.tools.some((tool) => tool.name === "list_rate_options"));
  assert.ok(tools.result.tools.some((tool) => tool.name === "check_source_status"));
  assert.ok(resources.result.resources.some((resource) => resource.uri === "openschedule://schemas/za-customs/customs-ruleset-container.v1"));
  assert.ok(resources.result.resources.some((resource) => resource.uri === "openschedule://schemas/za-customs/customs-ruleset.v1"));
  assert.ok(
    resources.result.resources.some(
      (resource) => resource.uri === "openschedule://schemas/za-customs/schedule1-excise-levies-parse-result.v1"
    )
  );
  assert.ok(resources.result.resources.some((resource) => resource.uri === "openschedule://schemas/za-customs/schedule2-parse-result.v1"));
  assert.ok(resources.result.resources.some((resource) => resource.uri === "openschedule://schemas/za-customs/schedule3-parse-result.v1"));
  assert.ok(resources.result.resources.some((resource) => resource.uri === "openschedule://schemas/za-customs/schedule4-parse-result.v1"));
  assert.ok(resources.result.resources.some((resource) => resource.uri === "openschedule://schemas/za-customs/schedule5-parse-result.v1"));
  assert.ok(resources.result.resources.some((resource) => resource.uri === "openschedule://schemas/za-customs/schedule6-parse-result.v1"));
  assert.ok(resources.result.resources.some((resource) => resource.uri === "openschedule://schemas/za-customs/schedule-family-qa-report.v1"));
  assert.ok(resources.result.resources.some((resource) => resource.uri === "openschedule://schemas/za-sars/customs-source-status.v1"));
});

test("reads schema resources and calls schema tools", async () => {
  const resource = await request("resources/read", { uri: "openschedule://schemas/za-customs/tariff-line.v1" });
  const schedule1ExciseResource = await request("resources/read", {
    uri: "openschedule://schemas/za-customs/schedule1-excise-levies-parse-result.v1"
  });
  const schedule2Resource = await request("resources/read", { uri: "openschedule://schemas/za-customs/schedule2-parse-result.v1" });
  const schedule3Resource = await request("resources/read", { uri: "openschedule://schemas/za-customs/schedule3-parse-result.v1" });
  const schedule4Resource = await request("resources/read", { uri: "openschedule://schemas/za-customs/schedule4-parse-result.v1" });
  const schedule5Resource = await request("resources/read", { uri: "openschedule://schemas/za-customs/schedule5-parse-result.v1" });
  const schedule6Resource = await request("resources/read", { uri: "openschedule://schemas/za-customs/schedule6-parse-result.v1" });
  const containerResource = await request("resources/read", { uri: "openschedule://schemas/za-customs/customs-ruleset-container.v1" });
  const familyQaResource = await request("resources/read", { uri: "openschedule://schemas/za-customs/schedule-family-qa-report.v1" });
  const statusResource = await request("resources/read", { uri: "openschedule://schemas/za-sars/customs-source-status.v1" });
  const schemas = await toolCall("list_schemas", {});
  const schema = await toolCall("get_schema", { uri: "openschedule://schemas/za-customs/tariff-line.v1" });

  assert.equal(JSON.parse(resource.result.contents[0].text).properties.schemaVersion.const, "za-customs.tariff-line.v1");
  assert.equal(
    JSON.parse(schedule1ExciseResource.result.contents[0].text).properties.schemaVersion.const,
    "za-customs.schedule1-excise-levies-parse-result.v1"
  );
  assert.equal(JSON.parse(schedule2Resource.result.contents[0].text).properties.schemaVersion.const, "za-customs.schedule2-parse-result.v1");
  assert.equal(JSON.parse(schedule3Resource.result.contents[0].text).properties.schemaVersion.const, "za-customs.schedule3-parse-result.v1");
  assert.equal(JSON.parse(schedule4Resource.result.contents[0].text).properties.schemaVersion.const, "za-customs.schedule4-parse-result.v1");
  assert.equal(JSON.parse(schedule5Resource.result.contents[0].text).properties.schemaVersion.const, "za-customs.schedule5-parse-result.v1");
  assert.equal(JSON.parse(schedule6Resource.result.contents[0].text).properties.schemaVersion.const, "za-customs.schedule6-parse-result.v1");
  assert.equal(JSON.parse(containerResource.result.contents[0].text).properties.schemaVersion.const, "za-customs.customs-ruleset-container.v1");
  assert.equal(JSON.parse(familyQaResource.result.contents[0].text).properties.schemaVersion.const, "za-customs.schedule-family-qa-report.v1");
  assert.equal(JSON.parse(statusResource.result.contents[0].text).properties.schemaVersion.const, "za-sars.customs-source-status.v1");
  assert.ok(structured(schemas).some((item) => item.uri === "openschedule://schemas/za-customs/tariff-line.v1"));
  assert.equal(structured(schema).properties.schemaVersion.const, "za-customs.tariff-line.v1");
});

test("discovers and fetches sources through tools", async () => {
  await withTempDir(async (dir) => {
    const responseBytes = Buffer.from("%PDF-1.7\nsynthetic\n");
    const fetch = async () =>
      new Response(responseBytes, {
        status: 200,
        headers: {
          "content-type": "application/pdf"
        }
      });

    const discovered = await toolCall("discover_sources", {});
    const fetched = await toolCall("fetch_sources", { outDir: dir }, { fetch });
    const status = await toolCall("check_source_status", { cacheDir: dir }, { fetch });

    assert.equal(structured(discovered)[0].id, "ZA_SARS_CUSTOMS_SCHEDULE_1_PART_1");
    assert.equal(structured(fetched)[0].bytes, responseBytes.byteLength);
    assert.equal(await readFile(structured(fetched)[0].documentPath, "utf8"), responseBytes.toString("utf8"));
    assert.equal(structured(status)[0].status, "unchanged");
    assert.ok(structured(status).some((item) => item.status === "manual-review"));
  });
});

test("wraps lookup, rates, estimate, validate, and diff APIs", async () => {
  await withTempDir(async (dir) => {
    const before = await writeRuleset(dir, "before.json", ruleset([tariffLine()]));
    const after = await writeRuleset(
      dir,
      "after.json",
      ruleset([tariffLine({ description: "Changed goods", normalizedDescription: "Changed goods" })])
    );

    const lookup = await toolCall("lookup_tariff_line", { rulesetPath: before, tariffCode: "000110" });
    const rates = await toolCall("list_rate_options", { rulesetPath: before, tariffCode: "0001.10" });
    const estimate = await toolCall("estimate_customs_duty", {
      rulesetPath: before,
      tariffCode: "0001.10",
      effectiveDate: "2026-07-04",
      customsValue: 1000
    });
    const validation = await toolCall("validate_ruleset", { rulesetPath: before });
    const diff = await toolCall("diff_rulesets", { beforePath: before, afterPath: after });

    assert.equal(structured(lookup).tariffCode, "0001.10");
    assert.deepEqual(structured(rates).map((option) => option.column), ["general", "sadc"]);
    assert.equal(structured(estimate).estimatedDuty, 100);
    assert.equal(structured(validation).valid, true);
    assert.ok(structured(diff).changes.some((change) => change.category === "description_changed"));
  });
});

test("wraps consumer ZA customs cache tools", async () => {
  await withTempDir(async (dir) => {
    await writeCustomsCache(
      dir,
      container([
        tariffLine({
          warnings: ["fixture line warning"],
          rates: {
            general: { raw: "10%", kind: "ad_valorem", components: [{ basis: "customs_value", rate: 0.1 }], warnings: ["fixture rate warning"] },
            sadc: rate("free", "free")
          }
        })
      ])
    );
    const base = { cacheDir: dir, sync: "never" };

    const sync = await toolCall("za_customs_sync", base);
    const lookup = await toolCall("za_customs_lookup", { ...base, tariffCode: "000110" });
    const richLookup = await toolCall("za_customs_lookup", { ...base, tariffCode: "000110", includeMetadata: true });
    const rates = await toolCall("za_customs_rates", { ...base, tariffCode: "0001.10" });
    const richRates = await toolCall("za_customs_rates", { ...base, tariffCode: "0001.10", includeMetadata: true });
    const estimate = await toolCall("za_customs_estimate", { ...base, tariffCode: "0001.10", customsValue: 1000 });
    const measures = await toolCall("za_customs_measures", { ...base, tariffCode: "0001.10" });
    const source = await toolCall("za_customs_source", { ...base, tariffCode: "0001.10" });

    assert.equal(structured(sync).validation.valid, true);
    assert.ok(structured(sync).manifestPath.endsWith(ZA_CUSTOMS_MANIFEST_FILE));
    assert.equal(structured(sync).artifactPath, undefined);
    assert.equal(structured(lookup).tariffCode, "0001.10");
    assert.equal(structured(lookup).metadata, undefined);
    assert.equal(structured(richLookup).metadata.warnings[0], "fixture line warning");
    assert.deepEqual(structured(rates).map((option) => option.column), ["general", "sadc"]);
    assert.equal(structured(rates)[0].metadata, undefined);
    assert.equal(structured(richRates)[0].metadata.warnings[0], "fixture rate warning");
    assert.equal(structured(estimate).estimatedDuty, 100);
    assert.equal("sourceTrace" in structured(estimate), false);
    assert.equal(structured(measures).items[0].metadata, undefined);
    assert.equal(structured(source)[0].document.fileName, "schedule.pdf");
  });
});

test("za_customs_sync reports source IDs fetched during client construction", async () => {
  await withTempDir(async (dir) => {
    const pdf = syntheticSchedulePdf();
    const fetch = async () =>
      new Response(pdf, {
        status: 200,
        headers: {
          "content-type": "application/pdf"
        }
      });

    const sync = await toolCall("za_customs_sync", { cacheDir: dir, sync: "if-missing" }, { fetch });

    assert.equal(sync.error, undefined);
    assert.ok(structured(sync).fetched.includes("ZA_SARS_CUSTOMS_SCHEDULE_1_PART_1"));
    assert.equal(structured(sync).validation.valid, true);
  });
});

test("returns JSON-RPC errors for bad requests", async () => {
  const response = await toolCall("lookup_tariff_line", { rulesetPath: "missing.json", tariffCode: "0001.10" });

  assert.equal(response.error.code, -32603);
  assert.match(response.error.message, /missing\.json/);
});
