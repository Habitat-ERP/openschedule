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
  sourceIdentifier?: string | null;
  sourceRole?: string | null;
  publishedDate?: string | null;
  effectiveDate?: string | null;
  supersedes?: readonly string[];
  supersededBy?: readonly string[];
  retrievedAt?: string | null;
}): SourceDocumentMetadataV1 {
  const metadata: SourceDocumentMetadataV1 = {
    schemaVersion: "core.source-document-metadata.v1",
    sha256: input.sha256,
    fileName: basename(input.filePath),
    sourceUrl: input.sourceUrl ?? null,
    retrievedAt: input.retrievedAt ?? null
  };
  if (input.sourceIdentifier !== undefined) metadata.sourceIdentifier = input.sourceIdentifier;
  if (input.sourceRole !== undefined) metadata.sourceRole = input.sourceRole;
  if (input.publishedDate !== undefined) metadata.publishedDate = input.publishedDate;
  if (input.effectiveDate !== undefined) metadata.effectiveDate = input.effectiveDate;
  if (input.supersedes?.length) metadata.supersedes = [...input.supersedes];
  if (input.supersededBy?.length) metadata.supersededBy = [...input.supersededBy];
  return metadata;
}

export async function writeSourceDocumentMetadata(
  metadataPath: string,
  metadata: SourceDocumentMetadataV1
): Promise<void> {
  await mkdir(dirname(metadataPath), { recursive: true });
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}
