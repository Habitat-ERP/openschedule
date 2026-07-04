import { extractCustomsPdfTextItems, type CustomsPdfTextItem, type CustomsPdfTextPage } from "./pdf-text.js";
import type {
  Schedule3IndustrialRebateContextV1,
  Schedule3IndustrialRebateLineV1,
  Schedule3ParsePageMetricsV1,
  Schedule3ParseResultV1,
  Schedule3PartV1
} from "./types.js";

export interface ParseSchedule3IndustrialRebatesPdfOptions {
  pdfPath: string;
  pages?: readonly number[];
}

export interface ParseSchedule3IndustrialRebatesTextPagesOptions {
  pages: readonly CustomsPdfTextPage[];
  sourceDocumentSha256: string;
  validFrom?: string;
}

interface NormalizedItem extends CustomsPdfTextItem {
  row: number;
  column: number;
}

interface LayoutRow {
  pageNumber: number;
  row: number;
  items: NormalizedItem[];
}

type ColumnName = "rebateItem" | "tariffHeading" | "rebateCode" | "checkDigit" | "description" | "extentOfRebate";

type ColumnLayout = Record<ColumnName, number>;

const DEFAULT_LAYOUT: ColumnLayout = {
  rebateItem: 39,
  tariffHeading: 115,
  rebateCode: 180,
  checkDigit: 225,
  description: 250,
  extentOfRebate: 702
};

const ROW_TOLERANCE = 2;
const CONTINUATION_ROW_GAP = 18;

export async function parseSchedule3IndustrialRebatesPdf(
  options: ParseSchedule3IndustrialRebatesPdfOptions
): Promise<Schedule3ParseResultV1> {
  const extraction = await extractCustomsPdfTextItems(options);
  return parseSchedule3IndustrialRebatesTextPages({
    pages: extraction.pages,
    sourceDocumentSha256: extraction.sourceDocumentSha256
  });
}

export function parseSchedule3IndustrialRebatesTextPages(
  options: ParseSchedule3IndustrialRebatesTextPagesOptions
): Schedule3ParseResultV1 {
  const metrics = {
    pagesParsed: options.pages.length,
    textItems: 0,
    layoutRows: 0,
    candidateRows: 0,
    contextRows: 0,
    rebateLines: 0,
    rejectedRows: 0
  };
  const warnings: string[] = [];
  const rebateLines: Schedule3IndustrialRebateLineV1[] = [];
  const pageMetrics: Schedule3ParsePageMetricsV1[] = [];
  let activeContexts: Schedule3IndustrialRebateContextV1[] = [];
  let activePart: Schedule3PartV1 = "unknown";

  for (const page of options.pages) {
    metrics.textItems += page.items.length;
    const pageRows = groupRows(page);
    metrics.layoutRows += pageRows.length;
    const currentPageMetrics: Schedule3ParsePageMetricsV1 = {
      pageNumber: page.pageNumber,
      textItems: page.items.length,
      layoutRows: pageRows.length,
      candidateRows: 0,
      contextRows: 0,
      rebateLines: 0,
      rejectedRows: 0
    };
    const layout = detectColumnLayout(pageRows);
    const pageDate = options.validFrom ?? extractPageDate(page.items);
    let pending: PendingLine | null = null;

    for (const row of pageRows) {
      const part = extractPart(rawRowText([row]));
      if (part) activePart = part;
      if (isHeaderRow(row)) continue;

      const fields = readRowFields(row, layout);
      if (fields.rebateItem) {
        if (pending) {
          rebateLines.push(buildIndustrialRebateLine(pending, options.sourceDocumentSha256, pageDate));
          metrics.rebateLines += 1;
          currentPageMetrics.rebateLines += 1;
        }
        pending = null;

        if (isContextRow(row, layout, fields)) {
          const context = buildIndustrialRebateContext(row, layout, fields, activePart, options.sourceDocumentSha256);
          activeContexts = [...activeContexts.filter((item) => item.level < context.level), context];
          metrics.contextRows += 1;
          currentPageMetrics.contextRows += 1;
          continue;
        }

        metrics.candidateRows += 1;
        currentPageMetrics.candidateRows += 1;
        if (!isIndustrialRebateCandidate(fields)) {
          metrics.rejectedRows += 1;
          currentPageMetrics.rejectedRows += 1;
          continue;
        }

        pending = {
          part: activePart,
          pageNumber: page.pageNumber,
          row,
          fields,
          context: activeContexts,
          continuationRows: [],
          lastRow: row.row
        };
        continue;
      }

      if (pending && row.row - pending.lastRow <= CONTINUATION_ROW_GAP) {
        const continuation = readRowFields(row, layout);
        if (isContinuationRow(continuation)) {
          pending.continuationRows.push({ row, fields: continuation });
          pending.lastRow = row.row;
        }
      }
    }

    if (pending) {
      rebateLines.push(buildIndustrialRebateLine(pending, options.sourceDocumentSha256, pageDate));
      metrics.rebateLines += 1;
      currentPageMetrics.rebateLines += 1;
    }
    pageMetrics.push(currentPageMetrics);
  }

  if (!rebateLines.length) {
    warnings.push("No Schedule 3 industrial rebate lines were parsed from the supplied pages.");
  }

  return {
    schemaVersion: "za-customs.schedule3-parse-result.v1",
    rebateLines,
    warnings,
    metrics,
    pageMetrics
  };
}

interface RowFields {
  rebateItem: string;
  tariffHeading: string;
  rebateCode: string;
  checkDigit: string;
  description: string;
  extentOfRebate: string;
}

interface PendingLine {
  part: Schedule3PartV1;
  pageNumber: number;
  row: LayoutRow;
  fields: RowFields;
  context: Schedule3IndustrialRebateContextV1[];
  continuationRows: Array<{
    row: LayoutRow;
    fields: RowFields;
  }>;
  lastRow: number;
}

function groupRows(page: CustomsPdfTextPage): LayoutRow[] {
  const normalized = page.items
    .map((item) => normalizeItem(page, item))
    .filter((item) => item.text.trim())
    .sort((a, b) => a.row - b.row || a.column - b.column);
  const rows: LayoutRow[] = [];

  for (const item of normalized) {
    const current = rows.at(-1);
    if (current && Math.abs(current.row - item.row) <= ROW_TOLERANCE) {
      current.items.push(item);
      current.row = average(current.row, item.row);
    } else {
      rows.push({ pageNumber: page.pageNumber, row: item.row, items: [item] });
    }
  }

  for (const row of rows) {
    row.items.sort((a, b) => a.column - b.column);
  }
  return rows;
}

function normalizeItem(page: CustomsPdfTextPage, item: CustomsPdfTextItem): NormalizedItem {
  const rotated = Math.abs(page.rotation % 180) === 90;
  return {
    ...item,
    row: rotated ? item.x : page.height - item.y,
    column: rotated ? item.y : item.x
  };
}

function detectColumnLayout(rows: LayoutRow[]): ColumnLayout {
  const layout = { ...DEFAULT_LAYOUT };
  for (const row of rows.slice(0, 10)) {
    for (const item of row.items) {
      const text = item.text.trim();
      if (text === "Rebate Item" || text === "Item") layout.rebateItem = item.column;
      if (text === "Tariff Heading" || text === "Tariff" || text === "Heading") layout.tariffHeading = item.column;
      if (text === "Rebate Code" || text === "Code") layout.rebateCode = item.column;
      if (text === "CD") layout.checkDigit = item.column;
      if (text === "Description") layout.description = item.column;
      if (text === "Extent of Rebate" || text.startsWith("Extent")) layout.extentOfRebate = item.column;
    }
  }
  return layout;
}

function readRowFields(row: LayoutRow, layout: ColumnLayout): RowFields {
  return {
    rebateItem: readColumn(row, layout, "rebateItem"),
    tariffHeading: readColumn(row, layout, "tariffHeading"),
    rebateCode: readColumn(row, layout, "rebateCode"),
    checkDigit: readColumn(row, layout, "checkDigit"),
    description: readColumn(row, layout, "description"),
    extentOfRebate: readColumn(row, layout, "extentOfRebate")
  };
}

function readColumn(row: LayoutRow, layout: ColumnLayout, column: ColumnName): string {
  const [min, max] = columnBounds(layout, column);
  return joinFragments(row.items.filter((item) => item.column >= min && item.column < max));
}

function columnBounds(layout: ColumnLayout, column: ColumnName): [number, number] {
  const entries = (Object.entries(layout) as Array<[ColumnName, number]>).sort((a, b) => a[1] - b[1]);
  const index = entries.findIndex(([name]) => name === column);
  const previous = entries[index - 1];
  const current = entries[index];
  const next = entries[index + 1];
  const min = previous ? (previous[1] + current[1]) / 2 : Number.NEGATIVE_INFINITY;
  const max = next ? (current[1] + next[1]) / 2 : Number.POSITIVE_INFINITY;
  return [min, max];
}

function buildIndustrialRebateLine(
  pending: PendingLine,
  sourceDocumentSha256: string,
  pageDate?: string
): Schedule3IndustrialRebateLineV1 {
  const warnings: string[] = [];
  const descriptionParts = [pending.fields.description];
  const extentParts = [pending.fields.extentOfRebate];

  for (const continuation of pending.continuationRows) {
    descriptionParts.push(continuation.fields.description);
    extentParts.push(continuation.fields.extentOfRebate);
  }

  const description = compactJoin(descriptionParts);
  const extentOfRebate = compactJoin(extentParts);

  if (!pending.fields.checkDigit) warnings.push("Missing check digit.");
  if (!description) warnings.push("Missing description.");
  if (!extentOfRebate) warnings.push("Missing extent of rebate.");
  if (pending.continuationRows.length) warnings.push("Description or extent text continued across layout rows.");

  return {
    schemaVersion: "za-customs.schedule3-industrial-rebate-line.v1",
    part: pending.part,
    rebateItem: pending.fields.rebateItem,
    normalizedRebateItem: normalizeDigits(pending.fields.rebateItem),
    tariffHeading: pending.fields.tariffHeading,
    normalizedTariffHeading: normalizeDigits(pending.fields.tariffHeading),
    rebateCode: pending.fields.rebateCode,
    normalizedRebateCode: normalizeDigits(pending.fields.rebateCode),
    checkDigit: pending.fields.checkDigit || null,
    description,
    normalizedDescription: normalizeDescription(description),
    extentOfRebate,
    validFrom: pageDate ?? "unknown",
    context: pending.context,
    sourcePublishedDate: pageDate ?? null,
    sourceImplementationDate: null,
    sourceTrace: [
      {
        schemaVersion: "core.source-trace.v1",
        sourceDocumentSha256,
        page: pending.pageNumber,
        locator: rowLocator([pending.row, ...pending.continuationRows.map((row) => row.row)]),
        text: rawRowText([pending.row, ...pending.continuationRows.map((row) => row.row)])
      }
    ],
    parseConfidence: calculateParseConfidence(warnings),
    warnings
  };
}

function buildIndustrialRebateContext(
  row: LayoutRow,
  layout: ColumnLayout,
  fields: RowFields,
  part: Schedule3PartV1,
  sourceDocumentSha256: string
): Schedule3IndustrialRebateContextV1 {
  const description = readContextDescription(row, layout);
  return {
    part,
    rebateItem: fields.rebateItem,
    normalizedRebateItem: normalizeDigits(fields.rebateItem),
    description,
    normalizedDescription: normalizeDescription(description),
    level: fields.rebateItem.endsWith(".00") ? 1 : 2,
    sourceTrace: [
      {
        schemaVersion: "core.source-trace.v1",
        sourceDocumentSha256,
        page: row.pageNumber,
        locator: rowLocator([row]),
        text: rawRowText([row])
      }
    ]
  };
}

function isHeaderRow(row: LayoutRow): boolean {
  const text = rawRowText([row]);
  return /^(Date:|Rebate Item|Tariff Heading|Heading|Rebate Code|SCHEDULE 3|GOODS USED|NOTES?:|\d+\.\s+)/.test(text);
}

function isContextRow(row: LayoutRow, layout: ColumnLayout, fields: RowFields): boolean {
  return Boolean(isSchedule3Item(fields.rebateItem) && !isIndustrialRebateCandidate(fields) && readContextDescription(row, layout));
}

function isIndustrialRebateCandidate(fields: RowFields): boolean {
  return Boolean(
    isSchedule3Item(fields.rebateItem) &&
      looksLikeDottedNumber(fields.tariffHeading) &&
      looksLikeDottedNumber(fields.rebateCode) &&
      fields.description
  );
}

function isContinuationRow(fields: RowFields): boolean {
  return Boolean(!fields.rebateItem && (fields.description || fields.extentOfRebate));
}

function isSchedule3Item(value: string): boolean {
  return /^\d{3}\.\d{2}$/.test(value);
}

function looksLikeDottedNumber(value: string): boolean {
  return /^\d{2,4}(?:\.\d{1,3})+$/.test(value);
}

function extractPageDate(items: readonly CustomsPdfTextItem[]): string | undefined {
  for (const item of items) {
    const match = item.text.match(/\bDate:\s*(\d{4}-\d{2}-\d{2})\b/);
    if (match) return match[1];
  }
  return undefined;
}

function extractPart(text: string): Schedule3PartV1 | null {
  const match = text.match(/\bSCHEDULE 3\s*(?:\/\s*)?PART\s*([12])\b/i);
  return match ? (match[1] as Schedule3PartV1) : null;
}

function readContextDescription(row: LayoutRow, layout: ColumnLayout): string {
  const [, itemMax] = columnBounds(layout, "rebateItem");
  return joinFragments(row.items.filter((item) => item.column >= itemMax));
}

function rowLocator(rows: readonly LayoutRow[]): string {
  const rowMin = Math.min(...rows.map((row) => row.row)).toFixed(2);
  const rowMax = Math.max(...rows.map((row) => row.row)).toFixed(2);
  const columns = rows.flatMap((row) => row.items.map((item) => item.column));
  return `pdfjs-dist:row=${rowMin}-${rowMax};columns=${Math.min(...columns).toFixed(2)}-${Math.max(...columns).toFixed(2)}`;
}

function rawRowText(rows: readonly LayoutRow[]): string {
  return rows.map((row) => joinFragments(row.items)).join(" ");
}

function joinFragments(items: readonly NormalizedItem[]): string {
  return compactJoin(items.map((item) => item.text));
}

function compactJoin(parts: readonly string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizeDescription(description: string): string {
  return description
    .replace(/^(?:[-–—]\s*)+/, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/:$/, "")
    .trim();
}

function calculateParseConfidence(warnings: readonly string[]): number {
  const penalty = warnings.reduce((total, warning) => total + warningPenalty(warning), 0);
  return Math.max(0, Number((1 - penalty).toFixed(2)));
}

function warningPenalty(warning: string): number {
  if (warning.startsWith("Missing")) return 0.2;
  if (warning.startsWith("Description or extent text continued")) return 0.1;
  return 0.12;
}

function average(left: number, right: number): number {
  return (left + right) / 2;
}
