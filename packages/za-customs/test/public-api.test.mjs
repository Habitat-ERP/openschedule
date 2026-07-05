import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ZA_CUSTOMS_MANIFEST_FILE,
  ZA_CUSTOMS_MEASURES_FILE,
  ZA_CUSTOMS_TARIFF_LINES_FILE,
  ZA_CUSTOMS_TARIFF_LINES_INDEX_FILE,
  writeCacheArtifacts,
  zaCustomsCachePaths
} from "../dist/src/cache-artifacts.js";
import { createZaCustoms } from "../dist/src/index.js";
import { buildCustomsRulesetContainer } from "../dist/src/internal.js";

const sourceDocumentSha256 = "0".repeat(64);
const sourceTrace = {
  schemaVersion: "core.source-trace.v1",
  sourceDocumentSha256,
  page: 1,
  locator: "synthetic fixture",
  text: "0001.10 Synthetic goods"
};
const sourceDocument = {
  schemaVersion: "core.source-document-metadata.v1",
  sha256: sourceDocumentSha256,
  fileName: "schedule.pdf",
  sourceIdentifier: "ZA_SARS_CUSTOMS_SCHEDULE_1_PART_1",
  sourceRole: "consolidated-schedule",
  publishedDate: "2026-07-01"
};

function rate(raw, kind, components = [], warnings = []) {
  return { raw, kind, components, warnings };
}

function tariffLine(overrides = {}) {
  const tariffCode = overrides.tariffCode ?? "0001.10";
  return {
    schemaVersion: "za-customs.tariff-line.v1",
    tariffCode,
    normalizedTariffCode: tariffCode.replace(/\D/g, ""),
    description: overrides.description ?? "Synthetic goods",
    normalizedDescription: overrides.normalizedDescription ?? "Synthetic goods",
    statisticalUnit: "kg",
    rates: {
      general: rate("10%", "ad_valorem", [{ basis: "customs_value", rate: 0.1 }], ["fixture rate warning"]),
      sadc: rate("free", "free")
    },
    validFrom: "2026-07-01",
    sourceTrace: [sourceTrace],
    parseConfidence: 1,
    warnings: ["fixture line warning"]
  };
}

function container() {
  const lines = [
    tariffLine(),
    tariffLine({
      tariffCode: "0001.20",
      description: "Second synthetic goods",
      normalizedDescription: "Second synthetic goods"
    })
  ];
  return buildCustomsRulesetContainer({
    manifest: {
      schemaVersion: "core.ruleset-manifest.v1",
      rulesetId: "",
      domain: "za-customs",
      country: "ZA",
      publisher: "SARS",
      generatedAt: "2026-07-05T00:00:00.000Z",
      effectiveDate: "latest",
      sourceDocuments: [sourceDocument],
      parser: { packageName: "@openschedule/za-customs", packageVersion: "0.0.0" },
      warnings: []
    },
    schedule1Part1: {
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
    }
  });
}

test("createZaCustoms loads cached data and exposes consumer methods", async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), "openschedule-public-api-"));
  try {
    const artifact = container();
    await writeCacheArtifacts(zaCustomsCachePaths(cacheDir), artifact);
    const cacheFiles = await readdir(cacheDir);
    assert.ok(cacheFiles.includes(ZA_CUSTOMS_MANIFEST_FILE));
    assert.ok(cacheFiles.includes(ZA_CUSTOMS_TARIFF_LINES_FILE));
    assert.ok(cacheFiles.includes(ZA_CUSTOMS_TARIFF_LINES_INDEX_FILE));
    assert.ok(cacheFiles.includes(ZA_CUSTOMS_MEASURES_FILE));

    const customs = await createZaCustoms({ cacheDir, sync: "never" });

    assert.equal(customs.rulesetId, artifact.manifest.rulesetId);
    const syncResult = await customs.sync({ mode: "never" });
    assert.ok(syncResult.manifestPath.endsWith(ZA_CUSTOMS_MANIFEST_FILE));
    assert.equal(syncResult.artifactPath, undefined);

    const line = customs.lookup("0001.10");
    assert.equal(line.normalizedTariffCode, "000110");
    assert.equal("sourceTrace" in line, false);
    assert.equal("warnings" in line, false);
    assert.equal(line.metadata, undefined);
    assert.equal(line.rates.general.metadata, undefined);
    assert.equal(customs.lookup("000120").description, "Second synthetic goods");

    const richLine = customs.lookup("000110", { includeMetadata: true });
    assert.equal(richLine.tariffCode, "0001.10");
    assert.equal(richLine.metadata.sourceTrace[0].locator, "synthetic fixture");
    assert.equal(richLine.metadata.sourceDocuments[0].sourceIdentifier, "ZA_SARS_CUSTOMS_SCHEDULE_1_PART_1");
    assert.deepEqual(richLine.rates.general.metadata.warnings, ["fixture rate warning"]);

    const rates = customs.rates("000110");
    assert.deepEqual(rates.map((option) => option.column), ["general", "sadc"]);
    assert.equal("sourceTrace" in rates[0], false);
    assert.equal("warnings" in rates[0], false);
    assert.equal(rates[0].metadata, undefined);
    assert.equal(customs.rates("000110", { includeMetadata: true })[0].metadata.sourceTrace[0].locator, "synthetic fixture");

    const estimate = customs.estimate({ tariffCode: "000110", customsValue: 1000, effectiveDate: "2026-07-05" });
    assert.equal(estimate.estimatedDuty, 100);
    assert.equal("sourceTrace" in estimate, false);
    assert.equal("warnings" in estimate, false);
    assert.equal("schemaVersion" in estimate, false);
    assert.ok(customs.estimate({ tariffCode: "000110", customsValue: 1000, effectiveDate: "2026-07-05", includeMetadata: true }).metadata.warnings.includes("fixture line warning"));

    const measures = customs.measures({ tariffCode: "000110" });
    assert.equal(measures.items[0].kind, "ordinary-duty");
    assert.equal(measures.items[0].metadata, undefined);
    assert.equal(measures.items[0].rates.general.metadata, undefined);

    const richMeasures = customs.measures({ tariffCode: "000110", includeMetadata: true });
    assert.equal(richMeasures.items[0].metadata.sourceTrace[0].locator, "synthetic fixture");
    assert.deepEqual(richMeasures.items[0].rates.general.metadata.warnings, ["fixture rate warning"]);
    assert.equal(customs.duties({ tariffCode: "0001.10" }).items.length, 1);
    assert.equal(customs.reliefs({ tariffCode: "0001.10" }).items.length, 0);
    assert.equal(customs.source("000110")[0].document.sourceIdentifier, "ZA_SARS_CUSTOMS_SCHEDULE_1_PART_1");
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
});
