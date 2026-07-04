import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  CustomsSourceV1Schema,
  CustomsSourceStatusV1Schema,
  FetchedCustomsSourceV1Schema,
  checkCustomsSources,
  discoverCustomsSourceGroups,
  discoverCustomsSources,
  fetchCustomsSources
} from "../dist/src/index.js";

test("exports source schemas", () => {
  assert.equal(CustomsSourceV1Schema.properties.schemaVersion.const, "za-sars.customs-source.v1");
  assert.ok(CustomsSourceV1Schema.required.includes("family"));
  assert.ok(CustomsSourceV1Schema.properties.sourceFormat.enum.includes("text/html"));
  assert.equal(
    FetchedCustomsSourceV1Schema.properties.schemaVersion.const,
    "za-sars.fetched-customs-source.v1"
  );
  assert.equal(
    CustomsSourceStatusV1Schema.properties.schemaVersion.const,
    "za-sars.customs-source-status.v1"
  );
  assert.ok(CustomsSourceStatusV1Schema.properties.status.enum.includes("manual-review"));
});

test("discovers SARS customs source families", () => {
  const sources = discoverCustomsSources();
  assert.equal(new Set(sources.map((source) => source.id)).size, sources.length);
  assert.equal(sources[0].id, "ZA_SARS_CUSTOMS_SCHEDULE_1_PART_1");
  assert.equal(sources[0].sourceFormat, "application/pdf");

  assert.ok(sources.some((source) => source.id === "ZA_SARS_CUSTOMS_SCHEDULE_2"));
  assert.ok(sources.some((source) => source.id === "ZA_SARS_CUSTOMS_SCHEDULE_6"));
  assert.ok(sources.some((source) => source.family === "amendment-notices" && source.sourceFormat === "text/html"));

  const groups = discoverCustomsSourceGroups();
  assert.ok(groups.some((group) => group.family === "schedule-1-customs" && group.sources.length >= 2));
  assert.ok(groups.some((group) => group.family === "rebates-drawbacks-refunds" && group.sources.length === 4));
});

test("fetches PDF bytes and writes source metadata", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "openschedule-za-sars-"));
  try {
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

    const pdfSources = discoverCustomsSources().filter((source) => source.sourceFormat === "application/pdf");
    const [result] = await fetchCustomsSources({ outDir, fetch });
    assert.equal(requests[0].init.method, "GET");
    assert.equal(requests[0].init.headers.accept, "application/pdf,*/*;q=0.8");
    assert.equal(requests.length, pdfSources.length);
    assert.equal(result.schemaVersion, "za-sars.fetched-customs-source.v1");
    assert.equal(result.bytes, responseBytes.byteLength);
    assert.equal(result.document.schemaVersion, "core.source-document-metadata.v1");
    assert.match(result.document.sha256, /^[a-f0-9]{64}$/);
    assert.equal(await readFile(result.documentPath, "utf8"), responseBytes.toString("utf8"));

    const metadata = JSON.parse(await readFile(result.metadataPath, "utf8"));
    assert.equal(metadata.sha256, result.document.sha256);
    assert.equal(metadata.fileName, result.document.fileName);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test("rejects non-PDF sources passed to fetch", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "openschedule-za-sars-"));
  try {
    const htmlSource = discoverCustomsSources().find((source) => source.sourceFormat === "text/html");
    assert.ok(htmlSource);
    await assert.rejects(
      fetchCustomsSources({ outDir, sources: [htmlSource], fetch: async () => new Response("ok") }),
      /Cannot fetch non-PDF source/
    );
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test("checks unchanged source status from fetched metadata and cache directory", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "openschedule-za-sars-"));
  try {
    const source = discoverCustomsSources().find((item) => item.sourceFormat === "application/pdf");
    assert.ok(source);
    const responseBytes = Buffer.from("%PDF-1.7\nsame\n");
    const fetch = async () =>
      new Response(responseBytes, {
        status: 200,
        headers: {
          "content-type": "application/pdf"
        }
      });

    const fetched = await fetchCustomsSources({ outDir, sources: [source], fetch });
    const fromFetched = await checkCustomsSources({ sources: [source], fetched, fetch });
    const fromCache = await checkCustomsSources({ sources: [source], cacheDir: outDir, fetch });

    assert.equal(fromFetched[0].schemaVersion, "za-sars.customs-source-status.v1");
    assert.equal(fromFetched[0].status, "unchanged");
    assert.equal(fromFetched[0].local.sha256, fetched[0].document.sha256);
    assert.equal(fromFetched[0].official.bytes, responseBytes.byteLength);
    assert.equal(fromCache[0].status, "unchanged");
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test("checks changed, missing, failed, non-PDF, and registry-page statuses", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "openschedule-za-sars-"));
  try {
    const source = discoverCustomsSources().find((item) => item.sourceFormat === "application/pdf");
    const registry = discoverCustomsSources().find((item) => item.sourceFormat === "text/html");
    assert.ok(source);
    assert.ok(registry);
    const fetched = await fetchCustomsSources({
      outDir,
      sources: [source],
      fetch: async () => new Response(Buffer.from("%PDF-1.7\nold\n"), { headers: { "content-type": "application/pdf" } })
    });

    const changed = await checkCustomsSources({
      sources: [source],
      fetched,
      fetch: async () => new Response(Buffer.from("%PDF-1.7\nnew\n"), { headers: { "content-type": "application/pdf" } })
    });
    const missing = await checkCustomsSources({ sources: [source] });
    const failed = await checkCustomsSources({
      sources: [source],
      fetched,
      fetch: async () => new Response("nope", { status: 500, headers: { "content-type": "application/pdf" } })
    });
    const nonPdf = await checkCustomsSources({
      sources: [source],
      fetched,
      fetch: async () => new Response("<html></html>", { headers: { "content-type": "text/html" } })
    });
    const registryStatus = await checkCustomsSources({ sources: [registry] });
    const descriptorChanged = await checkCustomsSources({
      sources: [source],
      fetched: [{ ...fetched[0], source: { ...source, sourceUpdatedDate: "2000-01-01" } }],
      fetch: async () => {
        throw new Error("descriptor change should not fetch");
      }
    });

    assert.equal(changed[0].status, "changed");
    assert.match(changed[0].reasons[0], /hash differs/);
    assert.equal(missing[0].status, "missing");
    assert.equal(failed[0].status, "failed");
    assert.match(failed[0].reasons[0], /HTTP 500/);
    assert.equal(nonPdf[0].status, "failed");
    assert.match(nonPdf[0].reasons[0], /Expected PDF/);
    assert.equal(registryStatus[0].status, "manual-review");
    assert.equal(descriptorChanged[0].status, "changed");
    assert.match(descriptorChanged[0].reasons[0], /updated date changed/);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
