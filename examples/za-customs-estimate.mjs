import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createZaCustoms } from "@openschedule/za-customs";
import { buildCustomsRulesetContainer } from "@openschedule/za-customs/internal";

const sourceDocumentSha256 = "0".repeat(64);
const sourceTrace = {
  schemaVersion: "core.source-trace.v1",
  sourceDocumentSha256,
  page: 1,
  locator: "synthetic fixture",
  text: "0001.10 Synthetic goods"
};

function rate(raw, kind, components = [], warnings = []) {
  return { raw, kind, components, warnings };
}

function line(tariffCode, description, generalRate) {
  const normalizedTariffCode = tariffCode.replace(/\D/g, "");
  return {
    schemaVersion: "za-customs.tariff-line.v1",
    tariffCode,
    normalizedTariffCode,
    description,
    normalizedDescription: description,
    statisticalUnit: "kg",
    rates: { general: generalRate },
    validFrom: "2026-07-01",
    sourceTrace: [sourceTrace],
    parseConfidence: 1,
    warnings: []
  };
}

function syntheticRuleset() {
  return buildCustomsRulesetContainer({
    manifest: {
      schemaVersion: "core.ruleset-manifest.v1",
      rulesetId: "",
      domain: "za-customs",
      country: "ZA",
      publisher: "SARS",
      generatedAt: "2026-07-05T00:00:00.000Z",
      effectiveDate: "latest",
      sourceDocuments: [{
        schemaVersion: "core.source-document-metadata.v1",
        sha256: sourceDocumentSha256,
        fileName: "synthetic-schedule.pdf",
        sourceIdentifier: "ZA_SARS_CUSTOMS_SCHEDULE_1_PART_1",
        sourceRole: "consolidated-schedule",
        publishedDate: "2026-07-01"
      }],
      parser: { packageName: "@openschedule/za-customs", packageVersion: "0.1.0" },
      warnings: []
    },
    schedule1Part1: {
      schemaVersion: "za-customs.schedule1-parse-result.v1",
      tariffLines: [
        line("0001.10", "Synthetic goods", rate("10%", "ad_valorem", [{ basis: "customs_value", rate: 0.1 }])),
        line("0001.20", "Synthetic unresolved goods", rate("formula rate", "formula"))
      ],
      warnings: [],
      metrics: {
        pagesParsed: 1,
        textItems: 2,
        layoutRows: 2,
        candidateRows: 2,
        contextRows: 0,
        tariffLines: 2,
        rejectedRows: 0
      }
    }
  });
}

const cacheDir = await mkdtemp(join(tmpdir(), "openschedule-za-customs-example-"));

try {
  await writeFile(join(cacheDir, "za-customs.json"), `${JSON.stringify(syntheticRuleset(), null, 2)}\n`);

  const customs = await createZaCustoms({ cacheDir, sync: "never" });
  const successful = customs.estimate({
    tariffCode: "000110",
    customsValue: 1000,
    effectiveDate: "2026-07-05"
  });
  const unresolved = customs.estimate({
    tariffCode: "000120",
    customsValue: 1000,
    effectiveDate: "2026-07-05",
    includeMetadata: true
  });

  console.log(JSON.stringify({
    lookup: customs.lookup("000110"),
    successful,
    unresolved: {
      estimatedDuty: unresolved.estimatedDuty,
      warnings: unresolved.metadata?.warnings ?? []
    }
  }, null, 2));
} finally {
  await rm(cacheDir, { recursive: true, force: true });
}
