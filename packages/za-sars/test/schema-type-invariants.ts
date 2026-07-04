import type { SourceDocumentMetadataV1 } from "@openschedule/core";
import type { FetchedCustomsSourceV1, SarsCustomsSourceStatusV1, SarsCustomsSourceV1 } from "../src/index.js";

const source = {
  schemaVersion: "za-sars.customs-source.v1",
  id: "ZA_SARS_CUSTOMS_SCHEDULE_1_PART_1",
  country: "ZA",
  publisher: "SARS",
  domain: "za-customs",
  family: "schedule-1-customs",
  documentRole: "consolidated-schedule",
  schedule: "1",
  part: "1",
  chapterRange: "1-99",
  title: "Schedule 1 Part 1 Chapters 1-99 - Ordinary Customs Duty",
  sourceFormat: "application/pdf",
  sourceUpdatedDate: "2026-05-29",
  registryPageUrl:
    "https://www.sars.gov.za/legal-counsel/primary-legislation/schedules-to-the-customs-and-excise-act-1964/",
  sourceUrl:
    "https://www.sars.gov.za/legal-lprim-ce-sch1p1chpt1-to-99-schedule-no-1-part-1-chapters-1-to-99/"
} satisfies SarsCustomsSourceV1;

const document = {
  schemaVersion: "core.source-document-metadata.v1",
  sha256: "0".repeat(64),
  fileName: "synthetic-source",
  sourceUrl: source.sourceUrl,
  retrievedAt: "2026-07-04T00:00:00.000Z"
} satisfies SourceDocumentMetadataV1;

const fetched = {
  schemaVersion: "za-sars.fetched-customs-source.v1",
  source,
  document,
  documentPath: "/tmp/synthetic-source.pdf",
  metadataPath: "/tmp/synthetic-source.pdf.metadata.json",
  bytes: 20,
  warnings: []
} satisfies FetchedCustomsSourceV1;

const status = {
  schemaVersion: "za-sars.customs-source-status.v1",
  source,
  status: "unchanged",
  checkedAt: "2026-07-04T00:00:00.000Z",
  local: {
    documentPath: "/tmp/synthetic-source.pdf",
    metadataPath: "/tmp/synthetic-source.pdf.metadata.json",
    sha256: document.sha256,
    sourceUrl: source.sourceUrl,
    sourceUpdatedDate: source.sourceUpdatedDate
  },
  official: {
    sourceUrl: source.sourceUrl,
    sourceUpdatedDate: source.sourceUpdatedDate,
    statusCode: 200,
    contentType: "application/pdf",
    sha256: document.sha256,
    bytes: 20
  },
  reasons: [],
  warnings: []
} satisfies SarsCustomsSourceStatusV1;

void fetched;
void status;
