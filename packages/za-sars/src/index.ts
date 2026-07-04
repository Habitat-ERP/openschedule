import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createSourceDocumentMetadata,
  hashFileSha256,
  writeSourceDocumentMetadata,
  type SourceDocumentMetadataV1
} from "@openschedule/core";

export * from "./schemas.js";

export interface SarsCustomsSourceV1 {
  schemaVersion: "za-sars.customs-source.v1";
  id: "ZA_SARS_CUSTOMS_SCHEDULE_1_PART_1";
  country: "ZA";
  publisher: "SARS";
  domain: "za-customs";
  schedule: "1";
  part: "1";
  chapterRange: "1-99";
  title: string;
  sourceFormat: "application/pdf";
  sourceUpdatedDate: string;
  registryPageUrl: string;
  sourceUrl: string;
}

export interface FetchCustomsSourcesOptions {
  outDir: string;
  sources?: readonly SarsCustomsSourceV1[];
  fetch?: typeof fetch;
}

export interface FetchedCustomsSourceV1 {
  schemaVersion: "za-sars.fetched-customs-source.v1";
  source: SarsCustomsSourceV1;
  document: SourceDocumentMetadataV1;
  documentPath: string;
  metadataPath: string;
  bytes: number;
  warnings: string[];
}

const SARS_SCHEDULES_URL =
  "https://www.sars.gov.za/legal-counsel/primary-legislation/schedules-to-the-customs-and-excise-act-1964/";

export const SARS_CUSTOMS_SCHEDULE_1_PART_1_SOURCE: SarsCustomsSourceV1 = {
  schemaVersion: "za-sars.customs-source.v1",
  id: "ZA_SARS_CUSTOMS_SCHEDULE_1_PART_1",
  country: "ZA",
  publisher: "SARS",
  domain: "za-customs",
  schedule: "1",
  part: "1",
  chapterRange: "1-99",
  title: "Schedule 1 Part 1 Chapters 1-99 - Ordinary Customs Duty",
  sourceFormat: "application/pdf",
  sourceUpdatedDate: "2026-05-29",
  registryPageUrl: SARS_SCHEDULES_URL,
  sourceUrl:
    "https://www.sars.gov.za/legal-lprim-ce-sch1p1chpt1-to-99-schedule-no-1-part-1-chapters-1-to-99/"
};

export function discoverCustomsSources(): SarsCustomsSourceV1[] {
  return [SARS_CUSTOMS_SCHEDULE_1_PART_1_SOURCE];
}

export async function fetchCustomsSources(
  options: FetchCustomsSourcesOptions
): Promise<FetchedCustomsSourceV1[]> {
  const fetcher = options.fetch ?? globalThis.fetch;
  const sources = options.sources ?? discoverCustomsSources();
  await mkdir(options.outDir, { recursive: true });

  const fetched: FetchedCustomsSourceV1[] = [];
  for (const source of sources) {
    const response = await fetcher(source.sourceUrl, {
      method: "GET",
      headers: {
        accept: "application/pdf,*/*;q=0.8"
      }
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${source.sourceUrl}: HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("pdf")) {
      throw new Error(`Expected PDF from ${source.sourceUrl}, got ${contentType || "unknown content type"}`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.subarray(0, 4).equals(Buffer.from("%PDF"))) {
      throw new Error(`Expected PDF bytes from ${source.sourceUrl}`);
    }

    const baseName = `${source.id}_${source.sourceUpdatedDate}`;
    const temporaryPath = join(options.outDir, `${baseName}.download`);
    await writeFile(temporaryPath, bytes);

    const sha256 = await hashFileSha256(temporaryPath);
    const documentPath = join(options.outDir, `${baseName}_${sha256.slice(0, 12)}.pdf`);
    await rename(temporaryPath, documentPath);

    const retrievedAt = new Date().toISOString();
    const document = createSourceDocumentMetadata({
      filePath: documentPath,
      sha256,
      sourceUrl: source.sourceUrl,
      retrievedAt
    });
    const metadataPath = `${documentPath}.metadata.json`;
    await writeSourceDocumentMetadata(metadataPath, document);

    fetched.push({
      schemaVersion: "za-sars.fetched-customs-source.v1",
      source,
      document,
      documentPath,
      metadataPath,
      bytes: bytes.byteLength,
      warnings: []
    });
  }

  return fetched;
}
