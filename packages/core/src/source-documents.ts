import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import type { SourceDocumentMetadataV1 } from "./types.js";

export async function hashFileSha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    createReadStream(filePath)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", resolve);
  });
  return hash.digest("hex");
}

export function createSourceDocumentMetadata(input: {
  filePath: string;
  sha256: string;
  sourceUrl?: string | null;
  retrievedAt?: string | null;
}): SourceDocumentMetadataV1 {
  return {
    schemaVersion: "core.source-document-metadata.v1",
    sha256: input.sha256,
    fileName: basename(input.filePath),
    sourceUrl: input.sourceUrl ?? null,
    retrievedAt: input.retrievedAt ?? null
  };
}

export async function writeSourceDocumentMetadata(
  metadataPath: string,
  metadata: SourceDocumentMetadataV1
): Promise<void> {
  await mkdir(dirname(metadataPath), { recursive: true });
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}
