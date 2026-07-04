import { mkdir, rename, writeFile } from "node:fs/promises";
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
