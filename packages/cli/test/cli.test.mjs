import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildCustomsRuleset, buildCustomsRulesetContainer } from "../../za-customs/dist/src/internal.js";
import { runCli } from "../dist/src/index.js";

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

async function invoke(args, runtime = {}) {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(args, {
    ...runtime,
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    }
  });
  return { exitCode, stdout, stderr, json: stdout ? JSON.parse(stdout) : null };
}

function rate(raw, kind, components = [], warnings = []) {
  return { raw, kind, components, warnings };
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
  const dir = await mkdtemp(join(tmpdir(), "openschedule-cli-"));
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
  await writeFile(join(dir, "za-customs.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("discovers SARS customs sources as JSON", async () => {
  const result = await invoke(["discover", "za-sars", "customs"]);

  assert.equal(result.exitCode, 0);
  assert.equal(result.json[0].id, "ZA_SARS_CUSTOMS_SCHEDULE_1_PART_1");
  assert.equal(result.stderr, "");
});

test("fetches SARS customs source with an injected fetch implementation", async () => {
  await withTempDir(async (dir) => {
    const responseBytes = Buffer.from("%PDF-1.7\nsynthetic\n");
    const requests = [];
    const fetch = async (input, init) => {
      requests.push({ input, init });
      return new Response(responseBytes, {
        status: 200,
        headers: {
          "content-type": "application/pdf"
        }
      });
    };

    const result = await invoke(["fetch", "za-sars", "customs", "--out", dir], { fetch });
    const status = await invoke(["status", "za-sars", "customs", "--cache", dir], { fetch });

    assert.equal(result.exitCode, 0);
    assert.equal(requests[0].init.method, "GET");
    assert.equal(result.json[0].bytes, responseBytes.byteLength);
    assert.equal(await readFile(result.json[0].documentPath, "utf8"), responseBytes.toString("utf8"));
    assert.equal(status.exitCode, 0);
    assert.equal(status.json[0].status, "unchanged");
    assert.ok(status.json.some((item) => item.status === "manual-review"));
  });
});

test("outputs schemas by group and schema name", async () => {
  const all = await invoke(["schemas", "za-customs"]);
  const one = await invoke(["schemas", "za-customs", "tariff-line"]);
  const status = await invoke(["schemas", "za-sars", "customs-source-status"]);

  assert.equal(all.exitCode, 0);
  assert.equal(all.json["tariff-line"].properties.schemaVersion.const, "za-customs.tariff-line.v1");
  assert.equal(all.json["customs-ruleset-container"].properties.schemaVersion.const, "za-customs.customs-ruleset-container.v1");
  assert.equal(all.json["schedule1-qa-report"].properties.schemaVersion.const, "za-customs.schedule1-qa-report.v1");
  assert.equal(all.json["schedule-family-qa-report"].properties.schemaVersion.const, "za-customs.schedule-family-qa-report.v1");
  assert.equal(
    all.json["schedule1-excise-levies-parse-result"].properties.schemaVersion.const,
    "za-customs.schedule1-excise-levies-parse-result.v1"
  );
  assert.equal(all.json["schedule2-parse-result"].properties.schemaVersion.const, "za-customs.schedule2-parse-result.v1");
  assert.equal(all.json["schedule3-parse-result"].properties.schemaVersion.const, "za-customs.schedule3-parse-result.v1");
  assert.equal(all.json["schedule4-parse-result"].properties.schemaVersion.const, "za-customs.schedule4-parse-result.v1");
  assert.equal(all.json["schedule5-parse-result"].properties.schemaVersion.const, "za-customs.schedule5-parse-result.v1");
  assert.equal(all.json["schedule6-parse-result"].properties.schemaVersion.const, "za-customs.schedule6-parse-result.v1");
  assert.equal(one.json.properties.schemaVersion.const, "za-customs.tariff-line.v1");
  assert.equal(status.json.properties.schemaVersion.const, "za-sars.customs-source-status.v1");
});

test("looks up tariff lines and lists available rates", async () => {
  await withTempDir(async (dir) => {
    const path = await writeRuleset(dir, "ruleset.json", ruleset([tariffLine()]));
    const lookup = await invoke(["lookup", path, "--tariff-code", "000110"]);
    const rates = await invoke(["rates", path, "--tariff-code", "0001.10"]);

    assert.equal(lookup.exitCode, 0);
    assert.equal(lookup.json.tariffCode, "0001.10");
    assert.deepEqual(rates.json.map((option) => option.column), ["general", "sadc"]);
  });
});

test("runs consumer customs commands from the managed cache", async () => {
  await withTempDir(async (dir) => {
    await writeCustomsCache(
      dir,
      container([
        tariffLine({
          warnings: ["fixture line warning"],
          rates: {
            general: rate("10%", "ad_valorem", [{ basis: "customs_value", rate: 0.1 }], ["fixture rate warning"]),
            sadc: rate("free", "free")
          }
        })
      ])
    );
    const base = ["--cache", dir, "--sync", "never"];

    const sync = await invoke(["customs", "sync", ...base]);
    const lookup = await invoke(["customs", "lookup", ...base, "--tariff-code", "000110"]);
    const richLookup = await invoke(["customs", "lookup", ...base, "--tariff-code", "000110", "--include-metadata"]);
    const rates = await invoke(["customs", "rates", ...base, "--tariff-code", "0001.10"]);
    const richRates = await invoke(["customs", "rates", ...base, "--tariff-code", "0001.10", "--include-metadata"]);
    const estimate = await invoke(["customs", "estimate", ...base, "--tariff-code", "0001.10", "--customs-value", "1000"]);
    const measures = await invoke(["customs", "measures", ...base, "--tariff-code", "0001.10"]);
    const source = await invoke(["customs", "source", ...base, "--tariff-code", "0001.10"]);

    assert.equal(sync.exitCode, 0);
    assert.equal(sync.json.validation.valid, true);
    assert.equal(lookup.exitCode, 0);
    assert.equal(lookup.json.tariffCode, "0001.10");
    assert.equal(lookup.json.metadata, undefined);
    assert.equal(richLookup.json.metadata.warnings[0], "fixture line warning");
    assert.deepEqual(rates.json.map((option) => option.column), ["general", "sadc"]);
    assert.equal(rates.json[0].metadata, undefined);
    assert.equal(richRates.json[0].metadata.warnings[0], "fixture rate warning");
    assert.equal(estimate.json.estimatedDuty, 100);
    assert.equal("sourceTrace" in estimate.json, false);
    assert.equal(measures.json.items[0].metadata, undefined);
    assert.equal(source.json[0].document.fileName, "schedule.pdf");
  });
});

test("inspects parser QA lines and reports QA queues", async () => {
  await withTempDir(async (dir) => {
    const path = await writeRuleset(dir, "ruleset.json", ruleset([tariffLine()]));
    const inspection = await invoke(["qa", "inspect", path, "--tariff-code", "0001.10"]);
    const report = await invoke(["qa", "report", path]);

    assert.equal(inspection.exitCode, 0);
    assert.equal(inspection.json[0].tariffCode, "0001.10");
    assert.equal(inspection.json[0].sourcePage, 1);
    assert.equal(inspection.json[0].rates.general.raw, "10%");
    assert.equal(report.exitCode, 0);
    assert.equal(report.json.schemaVersion, "za-customs.schedule1-qa-report.v1");
    assert.equal(report.json.summary.tariffLines, 1);
    assert.equal(report.json.summary.linesWithoutContext, 1);
  });
});

test("estimates duty and keeps unresolved estimates successful with warnings", async () => {
  await withTempDir(async (dir) => {
    const path = await writeRuleset(dir, "ruleset.json", ruleset([tariffLine()]));
    const estimated = await invoke([
      "estimate",
      path,
      "--tariff-code",
      "0001.10",
      "--effective-date",
      "2026-07-04",
      "--customs-value",
      "1000"
    ]);
    const unresolved = await invoke(["estimate", path, "--tariff-code", "9999.99", "--effective-date", "2026-07-04"]);

    assert.equal(estimated.exitCode, 0);
    assert.equal(estimated.json.estimatedDuty, 100);
    assert.equal(unresolved.exitCode, 0);
    assert.equal(unresolved.json.estimatedDuty, null);
    assert.ok(unresolved.stderr.includes("warning: No tariff line"));
  });
});

test("diffs two rulesets", async () => {
  await withTempDir(async (dir) => {
    const before = await writeRuleset(dir, "before.json", ruleset([tariffLine()]));
    const after = await writeRuleset(
      dir,
      "after.json",
      ruleset([tariffLine({ description: "Changed goods", normalizedDescription: "Changed goods" })])
    );

    const result = await invoke(["diff", before, after]);

    assert.equal(result.exitCode, 0);
    assert.ok(result.json.changes.some((change) => change.category === "description_changed"));
  });
});

test("returns usage and operational exit codes", async () => {
  await withTempDir(async (dir) => {
    const usage = await invoke(["estimate", "--bad"]);
    const missingPdf = await invoke(["build", "za-customs", "--sources", dir, "--out", join(dir, "ruleset.json")]);
    await writeFile(join(dir, "a.pdf"), "%PDF-1.7\n", "utf8");
    await writeFile(join(dir, "b.pdf"), "%PDF-1.7\n", "utf8");
    const multiplePdfs = await invoke(["build", "za-customs", "--sources", dir, "--out", join(dir, "ruleset.json")]);

    assert.equal(usage.exitCode, 2);
    assert.ok(usage.stderr.includes("usage error"));
    assert.equal(missingPdf.exitCode, 1);
    assert.ok(missingPdf.stderr.includes("No PDF files"));
    assert.equal(multiplePdfs.exitCode, 1);
    assert.ok(multiplePdfs.stderr.includes("Multiple PDF files"));
  });
});
