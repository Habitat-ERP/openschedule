import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createSourceDocumentMetadata,
  hashFileSha256,
  writeSourceDocumentMetadata,
  type SourceDocumentMetadataV1
} from "@openschedule/core";

export * from "./schemas.js";

export type SarsCustomsSourceFamily =
  | "schedule-1-customs"
  | "schedule-1-excise-levies"
  | "schedule-2-trade-remedies"
  | "rebates-drawbacks-refunds"
  | "amendment-notices";

export type SarsCustomsDocumentRole = "consolidated-schedule" | "amendment-registry";
export type SarsCustomsSourceFormat = "application/pdf" | "text/html";
export type SarsCustomsScheduleNumber = "1" | "2" | "3" | "4" | "5" | "6" | null;

export interface SarsCustomsSourceV1 {
  schemaVersion: "za-sars.customs-source.v1";
  id: string;
  country: "ZA";
  publisher: "SARS";
  domain: "za-customs";
  family: SarsCustomsSourceFamily;
  documentRole: SarsCustomsDocumentRole;
  schedule: SarsCustomsScheduleNumber;
  part?: string;
  section?: string;
  chapterRange?: string;
  title: string;
  sourceFormat: SarsCustomsSourceFormat;
  sourceUpdatedDate?: string;
  registryPageUrl: string;
  sourceUrl: string;
}

export interface SarsCustomsSourceGroupV1 {
  family: SarsCustomsSourceFamily;
  title: string;
  sources: SarsCustomsSourceV1[];
}

export interface FetchCustomsSourcesOptions {
  outDir: string;
  sources?: readonly SarsCustomsSourceV1[];
  fetch?: typeof fetch;
}

export interface CheckCustomsSourcesOptions {
  sources?: readonly SarsCustomsSourceV1[];
  fetched?: readonly FetchedCustomsSourceV1[];
  cacheDir?: string;
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

export type SarsCustomsSourceStatusKindV1 = "unchanged" | "changed" | "missing" | "failed" | "manual-review";

export interface SarsCustomsSourceStatusLocalV1 {
  documentPath: string | null;
  metadataPath: string | null;
  sha256: string | null;
  sourceUrl: string | null;
  sourceUpdatedDate: string | null;
}

export interface SarsCustomsSourceStatusOfficialV1 {
  sourceUrl: string;
  sourceUpdatedDate: string | null;
  statusCode: number | null;
  contentType: string | null;
  sha256: string | null;
  bytes: number | null;
}

export interface SarsCustomsSourceStatusV1 {
  schemaVersion: "za-sars.customs-source-status.v1";
  source: SarsCustomsSourceV1;
  status: SarsCustomsSourceStatusKindV1;
  checkedAt: string;
  local: SarsCustomsSourceStatusLocalV1 | null;
  official: SarsCustomsSourceStatusOfficialV1 | null;
  reasons: string[];
  warnings: string[];
}

const SARS_SCHEDULES_URL =
  "https://www.sars.gov.za/legal-counsel/primary-legislation/schedules-to-the-customs-and-excise-act-1964/";
const SARS_TARIFF_AMENDMENTS_URL =
  "https://www.sars.gov.za/legal-counsel/secondary-legislation/tariff-amendments/";
const SARS_TARIFF_AMENDMENTS_2026_URL =
  "https://www.sars.gov.za/legal-counsel/secondary-legislation/tariff-amendments/tariff-amendments-2026/";

type CustomsPdfSourceInput = Omit<
  SarsCustomsSourceV1,
  "schemaVersion" | "country" | "publisher" | "domain" | "documentRole" | "sourceFormat" | "registryPageUrl"
>;

function customsPdfSource(source: CustomsPdfSourceInput): SarsCustomsSourceV1 {
  return {
    schemaVersion: "za-sars.customs-source.v1",
    country: "ZA",
    publisher: "SARS",
    domain: "za-customs",
    documentRole: "consolidated-schedule",
    sourceFormat: "application/pdf",
    registryPageUrl: SARS_SCHEDULES_URL,
    ...source
  };
}

function amendmentRegistrySource(
  source: Omit<
    SarsCustomsSourceV1,
    "schemaVersion" | "country" | "publisher" | "domain" | "family" | "documentRole" | "schedule" | "sourceFormat"
  >
): SarsCustomsSourceV1 {
  return {
    schemaVersion: "za-sars.customs-source.v1",
    country: "ZA",
    publisher: "SARS",
    domain: "za-customs",
    family: "amendment-notices",
    documentRole: "amendment-registry",
    schedule: null,
    sourceFormat: "text/html",
    ...source
  };
}

export const SARS_CUSTOMS_SCHEDULE_1_PART_1_SOURCE = customsPdfSource({
  id: "ZA_SARS_CUSTOMS_SCHEDULE_1_PART_1",
  family: "schedule-1-customs",
  schedule: "1",
  part: "1",
  chapterRange: "1-99",
  title: "Schedule 1 Part 1 Chapters 1-99 - Ordinary Customs Duty",
  sourceUpdatedDate: "2026-05-29",
  sourceUrl:
    "https://www.sars.gov.za/legal-lprim-ce-sch1p1chpt1-to-99-schedule-no-1-part-1-chapters-1-to-99/"
});

export const SARS_CUSTOMS_SOURCES: readonly SarsCustomsSourceV1[] = [
  SARS_CUSTOMS_SCHEDULE_1_PART_1_SOURCE,
  customsPdfSource({
    id: "ZA_SARS_CUSTOMS_SCHEDULE_1_GENERAL_NOTES",
    family: "schedule-1-customs",
    schedule: "1",
    title: "Schedule 1 General Notes",
    sourceUpdatedDate: "2026-03-27",
    sourceUrl: "https://www.sars.gov.za/legal-lprim-ce-sch1gen-general-notes-to-schedules-to-customs-and-excise-act/"
  }),
  customsPdfSource({
    id: "ZA_SARS_CUSTOMS_SCHEDULE_1_PART_2A",
    family: "schedule-1-excise-levies",
    schedule: "1",
    part: "2A",
    section: "A",
    title: "Schedule 1 Part 2A - Specific Excise Duties",
    sourceUpdatedDate: "2026-04-30",
    sourceUrl: "https://www.sars.gov.za/legal-lprim-ce-sch1p2a-schedule-no-1-part-2a/"
  }),
  customsPdfSource({
    id: "ZA_SARS_CUSTOMS_SCHEDULE_1_PART_2B",
    family: "schedule-1-excise-levies",
    schedule: "1",
    part: "2B",
    section: "B",
    title: "Schedule 1 Part 2B - Ad Valorem Excise Duties",
    sourceUpdatedDate: "2025-04-01",
    sourceUrl: "https://www.sars.gov.za/legal-lprim-ce-sch1p2b-schedule-no-1-part-2b/"
  }),
  customsPdfSource({
    id: "ZA_SARS_CUSTOMS_SCHEDULE_1_PART_3",
    family: "schedule-1-excise-levies",
    schedule: "1",
    part: "3",
    title: "Schedule 1 Part 3 - Environmental Levy Notes",
    sourceUrl: "https://www.sars.gov.za/legal-lprim-ce-sch1p3-schedule-no-1-part-3/"
  }),
  customsPdfSource({
    id: "ZA_SARS_CUSTOMS_SCHEDULE_1_PART_3A",
    family: "schedule-1-excise-levies",
    schedule: "1",
    part: "3A",
    section: "A",
    title: "Schedule 1 Part 3A - Environmental Levy on Plastic Bags",
    sourceUpdatedDate: "2024-04-01",
    sourceUrl: "https://www.sars.gov.za/legal-lprim-ce-sch1p3a-schedule-no-1-part-3a/"
  }),
  customsPdfSource({
    id: "ZA_SARS_CUSTOMS_SCHEDULE_1_PART_3B",
    family: "schedule-1-excise-levies",
    schedule: "1",
    part: "3B",
    section: "B",
    title: "Schedule 1 Part 3B - Environmental Levy on Electricity Generated in the Republic",
    sourceUpdatedDate: "2012-07-01",
    sourceUrl: "https://www.sars.gov.za/legal-lprim-ce-sch1p3b-schedule-no-1-part-3b/"
  }),
  customsPdfSource({
    id: "ZA_SARS_CUSTOMS_SCHEDULE_1_PART_3C",
    family: "schedule-1-excise-levies",
    schedule: "1",
    part: "3C",
    section: "C",
    title: "Schedule 1 Part 3C - Environmental Levy on Electric Filament Lamps",
    sourceUpdatedDate: "2024-04-01",
    sourceUrl: "https://www.sars.gov.za/legal-lprim-ce-sch1p3c-schedule-no-1-part-3c/"
  }),
  customsPdfSource({
    id: "ZA_SARS_CUSTOMS_SCHEDULE_1_PART_3D",
    family: "schedule-1-excise-levies",
    schedule: "1",
    part: "3D",
    section: "D",
    title: "Schedule 1 Part 3D - Environmental Levy on Carbon Dioxide Emissions of Motor Vehicles",
    sourceUpdatedDate: "2024-04-01",
    sourceUrl: "https://www.sars.gov.za/legal-lprim-ce-sch1p3d-schedule-no-1-part-3d/"
  }),
  customsPdfSource({
    id: "ZA_SARS_CUSTOMS_SCHEDULE_1_PART_3E",
    family: "schedule-1-excise-levies",
    schedule: "1",
    part: "3E",
    section: "E",
    title: "Schedule 1 Part 3E - Environmental Levy on Tyres",
    sourceUpdatedDate: "2026-03-27",
    sourceUrl: "https://www.sars.gov.za/legal-lprim-ce-sch1p3e-schedule-no-1-part-3e/"
  }),
  customsPdfSource({
    id: "ZA_SARS_CUSTOMS_SCHEDULE_1_PART_3F",
    family: "schedule-1-excise-levies",
    schedule: "1",
    part: "3F",
    section: "F",
    title: "Schedule 1 Part 3F - Environmental Levy on Carbon Emissions",
    sourceUpdatedDate: "2025-04-11",
    sourceUrl: "https://www.sars.gov.za/legal-lprim-ce-sch1p3f-schedule-no-1-part-3f/"
  }),
  customsPdfSource({
    id: "ZA_SARS_CUSTOMS_SCHEDULE_1_PART_5A",
    family: "schedule-1-excise-levies",
    schedule: "1",
    part: "5A",
    section: "A",
    title: "Schedule 1 Part 5A - Fuel Levy",
    sourceUpdatedDate: "2026-07-01",
    sourceUrl: "https://www.sars.gov.za/legal-lprim-ce-sch1p5a-schedule-no-1-part-5a/"
  }),
  customsPdfSource({
    id: "ZA_SARS_CUSTOMS_SCHEDULE_1_PART_5B",
    family: "schedule-1-excise-levies",
    schedule: "1",
    part: "5B",
    section: "B",
    title: "Schedule 1 Part 5B - Road Accident Fund Levy",
    sourceUpdatedDate: "2026-04-01",
    sourceUrl: "https://www.sars.gov.za/legal-lprim-ce-sch1p5b-schedule-no-1-part-5b/"
  }),
  customsPdfSource({
    id: "ZA_SARS_CUSTOMS_SCHEDULE_1_PART_6",
    family: "schedule-1-excise-levies",
    schedule: "1",
    part: "6",
    title: "Schedule 1 Part 6 - Export Duty on Scrap Metal",
    sourceUpdatedDate: "2021-08-01",
    sourceUrl: "https://www.sars.gov.za/legal-lprim-ce-sch1p6-schedule-no-1-part-6/"
  }),
  customsPdfSource({
    id: "ZA_SARS_CUSTOMS_SCHEDULE_1_PART_7",
    family: "schedule-1-excise-levies",
    schedule: "1",
    part: "7",
    title: "Schedule 1 Part 7 - Health Promotion Levy",
    sourceUpdatedDate: "2019-04-01",
    sourceUrl: "https://www.sars.gov.za/legal-lprim-ce-sch1p7-schedule-no-1-part-7/"
  }),
  customsPdfSource({
    id: "ZA_SARS_CUSTOMS_SCHEDULE_1_PART_7A",
    family: "schedule-1-excise-levies",
    schedule: "1",
    part: "7A",
    section: "A",
    title: "Schedule 1 Part 7A - Levy on Sugary Beverages",
    sourceUpdatedDate: "2022-10-01",
    sourceUrl: "https://www.sars.gov.za/legal-lprim-ce-sch1p7a-schedule-no-1-part-7a/"
  }),
  customsPdfSource({
    id: "ZA_SARS_CUSTOMS_SCHEDULE_1_PART_8",
    family: "schedule-1-excise-levies",
    schedule: "1",
    part: "8",
    title: "Schedule 1 Part 8 - Ordinary Levy",
    sourceUpdatedDate: "2010-03-08",
    sourceUrl: "https://www.sars.gov.za/legal-lprim-ce-sch1p8-schedule-no-1-part-8/"
  }),
  customsPdfSource({
    id: "ZA_SARS_CUSTOMS_SCHEDULE_2",
    family: "schedule-2-trade-remedies",
    schedule: "2",
    title: "Schedule 2 - Anti-dumping, Countervailing and Safeguard Duties on Imported Goods",
    sourceUpdatedDate: "2026-06-12",
    sourceUrl: "https://www.sars.gov.za/legal-lprim-ce-sch2-schedule-no-2/"
  }),
  customsPdfSource({
    id: "ZA_SARS_CUSTOMS_SCHEDULE_3",
    family: "rebates-drawbacks-refunds",
    schedule: "3",
    title: "Schedule 3 - Industrial Rebates of Customs Duties",
    sourceUpdatedDate: "2026-06-19",
    sourceUrl: "https://www.sars.gov.za/legal-lprim-ce-sch3-schedule-no-3/"
  }),
  customsPdfSource({
    id: "ZA_SARS_CUSTOMS_SCHEDULE_4",
    family: "rebates-drawbacks-refunds",
    schedule: "4",
    title: "Schedule 4 - General Rebates of Customs Duties, Fuel Levy and Environmental Levy",
    sourceUpdatedDate: "2026-06-12",
    sourceUrl: "https://www.sars.gov.za/legal-lprim-ce-sch4-schedule-no-4/"
  }),
  customsPdfSource({
    id: "ZA_SARS_CUSTOMS_SCHEDULE_5",
    family: "rebates-drawbacks-refunds",
    schedule: "5",
    title: "Schedule 5 - Specific Drawbacks and Refunds of Customs Duties, Fuel Levy and Environmental Levy",
    sourceUpdatedDate: "2026-01-01",
    sourceUrl: "https://www.sars.gov.za/legal-lprim-ce-sch5-schedule-no-5/"
  }),
  customsPdfSource({
    id: "ZA_SARS_CUSTOMS_SCHEDULE_6",
    family: "rebates-drawbacks-refunds",
    schedule: "6",
    title: "Schedule 6 - Refunds and Rebates of Excise Duties, Fuel Levy and Environmental Levy",
    sourceUpdatedDate: "2026-07-01",
    sourceUrl: "https://www.sars.gov.za/legal-lprim-ce-sch6-schedule-no-6/"
  }),
  amendmentRegistrySource({
    id: "ZA_SARS_CUSTOMS_TARIFF_AMENDMENTS",
    title: "Tariff Amendments - Annual Notice Registry",
    sourceUpdatedDate: "2024-08-22",
    registryPageUrl: SARS_TARIFF_AMENDMENTS_URL,
    sourceUrl: SARS_TARIFF_AMENDMENTS_URL
  }),
  amendmentRegistrySource({
    id: "ZA_SARS_CUSTOMS_TARIFF_AMENDMENTS_2026",
    title: "Tariff Amendments 2026 - Current Year Notices",
    sourceUpdatedDate: "2026-06-19",
    registryPageUrl: SARS_TARIFF_AMENDMENTS_URL,
    sourceUrl: SARS_TARIFF_AMENDMENTS_2026_URL
  })
];

const SOURCE_GROUP_TITLES: Record<SarsCustomsSourceFamily, string> = {
  "schedule-1-customs": "Schedule 1 customs duties and notes",
  "schedule-1-excise-levies": "Schedule 1 excise and levy sources",
  "schedule-2-trade-remedies": "Schedule 2 trade remedy duties",
  "rebates-drawbacks-refunds": "Rebates, drawbacks and refunds",
  "amendment-notices": "Tariff amendment notice registries"
};

export function discoverCustomsSources(): SarsCustomsSourceV1[] {
  return [...SARS_CUSTOMS_SOURCES];
}

export function discoverCustomsSourceGroups(): SarsCustomsSourceGroupV1[] {
  const groups = new Map<SarsCustomsSourceFamily, SarsCustomsSourceV1[]>();
  for (const source of SARS_CUSTOMS_SOURCES) {
    groups.set(source.family, [...(groups.get(source.family) ?? []), source]);
  }
  return Array.from(groups, ([family, sources]) => ({
    family,
    title: SOURCE_GROUP_TITLES[family],
    sources
  }));
}

export async function fetchCustomsSources(
  options: FetchCustomsSourcesOptions
): Promise<FetchedCustomsSourceV1[]> {
  const fetcher = options.fetch ?? globalThis.fetch;
  const sources =
    options.sources ?? discoverCustomsSources().filter((source) => source.sourceFormat === "application/pdf");
  await mkdir(options.outDir, { recursive: true });

  const fetched: FetchedCustomsSourceV1[] = [];
  for (const source of sources) {
    if (source.sourceFormat !== "application/pdf") {
      throw new Error(`Cannot fetch non-PDF source ${source.id}: ${source.sourceFormat}`);
    }

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

    const baseName = `${source.id}_${source.sourceUpdatedDate ?? "undated"}`;
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

interface LocalCustomsSource {
  source: SarsCustomsSourceV1 | null;
  document: SourceDocumentMetadataV1;
  documentPath: string | null;
  metadataPath: string | null;
}

class CustomsSourceCheckError extends Error {
  constructor(
    message: string,
    readonly official: SarsCustomsSourceStatusOfficialV1
  ) {
    super(message);
  }
}

export async function checkCustomsSources(
  options: CheckCustomsSourcesOptions = {}
): Promise<SarsCustomsSourceStatusV1[]> {
  const sources = options.sources ?? discoverCustomsSources();
  const fetcher = options.fetch ?? globalThis.fetch;
  const checkedAt = new Date().toISOString();
  const localSources = [
    ...(options.fetched ?? []).map(localFromFetchedSource),
    ...(options.cacheDir ? await readCachedSources(options.cacheDir) : [])
  ];
  const statuses: SarsCustomsSourceStatusV1[] = [];

  for (const source of sources) {
    if (source.sourceFormat !== "application/pdf") {
      statuses.push(status(source, "manual-review", checkedAt, null, officialFromSource(source), [
        "HTML registry pages are declared sources but are not cached as fetched documents yet."
      ]));
      continue;
    }

    const matches = localSources.filter((local) => localMatchesSource(local, source));
    if (!matches.length) {
      statuses.push(status(source, "missing", checkedAt, null, officialFromSource(source), ["No local fetched metadata matched this source."]));
      continue;
    }
    if (matches.length > 1) {
      statuses.push(status(source, "manual-review", checkedAt, null, officialFromSource(source), [
        "Multiple local fetched metadata files matched this source."
      ]));
      continue;
    }

    const local = matches[0];
    const localSummary = localStatus(local, source);
    if (!local.documentPath || !(await pathExists(local.documentPath))) {
      statuses.push(status(source, "missing", checkedAt, localSummary, officialFromSource(source), ["Local fetched document is absent."]));
      continue;
    }

    const descriptorReasons = descriptorChangeReasons(source, local);
    if (descriptorReasons.length) {
      statuses.push(status(source, "changed", checkedAt, localSummary, officialFromSource(source), descriptorReasons));
      continue;
    }

    try {
      const official = await fetchOfficialPdfStatus(source, fetcher);
      const unchanged = official.sha256 === local.document.sha256;
      statuses.push(
        status(
          source,
          unchanged ? "unchanged" : "changed",
          checkedAt,
          localSummary,
          official,
          unchanged ? [] : ["Official source bytes hash differs from local fetched metadata."]
        )
      );
    } catch (error) {
      statuses.push(
        status(source, "failed", checkedAt, localSummary, errorOfficial(source, error), [
          error instanceof Error ? error.message : String(error)
        ])
      );
    }
  }

  return statuses;
}

function status(
  source: SarsCustomsSourceV1,
  sourceStatus: SarsCustomsSourceStatusKindV1,
  checkedAt: string,
  local: SarsCustomsSourceStatusLocalV1 | null,
  official: SarsCustomsSourceStatusOfficialV1 | null,
  reasons: string[],
  warnings: string[] = []
): SarsCustomsSourceStatusV1 {
  return {
    schemaVersion: "za-sars.customs-source-status.v1",
    source,
    status: sourceStatus,
    checkedAt,
    local,
    official,
    reasons,
    warnings
  };
}

function localFromFetchedSource(fetched: FetchedCustomsSourceV1): LocalCustomsSource {
  return {
    source: fetched.source,
    document: fetched.document,
    documentPath: fetched.documentPath,
    metadataPath: fetched.metadataPath
  };
}

async function readCachedSources(cacheDir: string): Promise<LocalCustomsSource[]> {
  const locals: LocalCustomsSource[] = [];
  for (const entry of await readdir(cacheDir)) {
    if (!entry.endsWith(".metadata.json")) continue;
    const metadataPath = join(cacheDir, entry);
    const document = parseSourceDocumentMetadata(await readFile(metadataPath, "utf8"));
    if (!document) continue;
    locals.push({
      source: null,
      document,
      documentPath: document.fileName ? join(cacheDir, document.fileName) : metadataPath.slice(0, -".metadata.json".length),
      metadataPath
    });
  }
  return locals;
}

function parseSourceDocumentMetadata(json: string): SourceDocumentMetadataV1 | null {
  try {
    const value = JSON.parse(json) as Partial<SourceDocumentMetadataV1>;
    if (value.schemaVersion !== "core.source-document-metadata.v1") return null;
    if (typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256)) return null;
    return value as SourceDocumentMetadataV1;
  } catch {
    return null;
  }
}

function localMatchesSource(local: LocalCustomsSource, source: SarsCustomsSourceV1): boolean {
  if (local.source?.id === source.id) return true;
  if (local.document.sourceUrl === source.sourceUrl) return true;
  return Boolean(local.document.fileName?.startsWith(`${source.id}_`));
}

function localStatus(local: LocalCustomsSource, source: SarsCustomsSourceV1): SarsCustomsSourceStatusLocalV1 {
  return {
    documentPath: local.documentPath,
    metadataPath: local.metadataPath,
    sha256: local.document.sha256,
    sourceUrl: local.source?.sourceUrl ?? local.document.sourceUrl ?? null,
    sourceUpdatedDate: local.source?.sourceUpdatedDate ?? sourceUpdatedDateFromFileName(local.document.fileName, source.id)
  };
}

function descriptorChangeReasons(source: SarsCustomsSourceV1, local: LocalCustomsSource): string[] {
  const reasons: string[] = [];
  const localSourceUrl = local.source?.sourceUrl ?? local.document.sourceUrl ?? null;
  const localUpdatedDate = local.source?.sourceUpdatedDate ?? sourceUpdatedDateFromFileName(local.document.fileName, source.id);

  if (localSourceUrl && localSourceUrl !== source.sourceUrl) {
    reasons.push("Source URL changed since the local fetched metadata was written.");
  }
  if ((localUpdatedDate ?? null) !== (source.sourceUpdatedDate ?? null)) {
    reasons.push("Source updated date changed since the local fetched metadata was written.");
  }
  return reasons;
}

function sourceUpdatedDateFromFileName(fileName: string | null | undefined, sourceId: string): string | null {
  const prefix = `${sourceId}_`;
  if (!fileName?.startsWith(prefix)) return null;
  const value = fileName.slice(prefix.length, prefix.length + 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

async function fetchOfficialPdfStatus(
  source: SarsCustomsSourceV1,
  fetcher: typeof fetch
): Promise<SarsCustomsSourceStatusOfficialV1> {
  const response = await fetcher(source.sourceUrl, {
    method: "GET",
    headers: {
      accept: "application/pdf,*/*;q=0.8"
    }
  });
  const official = officialFromSource(source, response.status, response.headers.get("content-type"));
  if (!response.ok) {
    throw new CustomsSourceCheckError(`Failed to fetch ${source.sourceUrl}: HTTP ${response.status}`, official);
  }
  if (!official.contentType?.toLowerCase().includes("pdf")) {
    throw new CustomsSourceCheckError(
      `Expected PDF from ${source.sourceUrl}, got ${official.contentType || "unknown content type"}`,
      official
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.subarray(0, 4).equals(Buffer.from("%PDF"))) {
    throw new CustomsSourceCheckError(`Expected PDF bytes from ${source.sourceUrl}`, { ...official, bytes: bytes.byteLength });
  }
  return {
    ...official,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex")
  };
}

function officialFromSource(
  source: SarsCustomsSourceV1,
  statusCode: number | null = null,
  contentType: string | null = null
): SarsCustomsSourceStatusOfficialV1 {
  return {
    sourceUrl: source.sourceUrl,
    sourceUpdatedDate: source.sourceUpdatedDate ?? null,
    statusCode,
    contentType,
    sha256: null,
    bytes: null
  };
}

function errorOfficial(source: SarsCustomsSourceV1, error: unknown): SarsCustomsSourceStatusOfficialV1 {
  return error instanceof CustomsSourceCheckError ? error.official : officialFromSource(source);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
