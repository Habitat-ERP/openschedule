import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  CustomsSourceV1Schema,
  FetchedCustomsSourceV1Schema,
  discoverCustomsSources,
  fetchCustomsSources
} from "../dist/src/index.js";

test("exports source schemas", () => {
  assert.equal(CustomsSourceV1Schema.properties.schemaVersion.const, "za-sars.customs-source.v1");
  assert.equal(
    FetchedCustomsSourceV1Schema.properties.schemaVersion.const,
    "za-sars.fetched-customs-source.v1"
  );
});

test("discovers the Schedule 1 Part 1 customs source", () => {
  const sources = discoverCustomsSources();
  assert.equal(sources.length, 1);
  assert.equal(sources[0].id, "ZA_SARS_CUSTOMS_SCHEDULE_1_PART_1");
  assert.equal(sources[0].sourceFormat, "application/pdf");
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

    const [result] = await fetchCustomsSources({ outDir, fetch });
    assert.equal(requests[0].init.method, "GET");
    assert.equal(requests[0].init.headers.accept, "application/pdf,*/*;q=0.8");
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
