import { extractCustomsPdfTextItems, type CustomsPdfTextItem, type CustomsPdfTextPage } from "./pdf-text.js";
import type {
  Schedule5DrawbackRefundContextV1,
  Schedule5DrawbackRefundLineV1,
  Schedule5ParsePageMetricsV1,
  Schedule5ParseResultV1,
  Schedule5PartV1
} from "./types.js";

export interface ParseSchedule5DrawbacksRefundsPdfOptions {
  pdfPath: string;
  pages?: readonly number[];
}

export interface ParseSchedule5DrawbacksRefundsTextPagesOptions {
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

type ColumnName = "item" | "tariffHeading" | "code" | "checkDigit" | "description" | "extent";

type ColumnLayout = Record<ColumnName, number>;

const DEFAULT_LAYOUT: ColumnLayout = {
  item: 39,
  tariffHeading: 115,
  code: 180,
  checkDigit: 225,
  description: 250,
  extent: 702
};

const ROW_TOLERANCE = 2;
const CONTINUATION_ROW_GAP = 18;

export async function parseSchedule5DrawbacksRefundsPdf(
  options: ParseSchedule5DrawbacksRefundsPdfOptions
): Promise<Schedule5ParseResultV1> {
  const extraction = await extractCustomsPdfTextItems(options);
  return parseSchedule5DrawbacksRefundsTextPages({
    pages: extraction.pages,
    sourceDocumentSha256: extraction.sourceDocumentSha256
  });
}

export function parseSchedule5DrawbacksRefundsTextPages(
  options: ParseSchedule5DrawbacksRefundsTextPagesOptions
): Schedule5ParseResultV1 {
  const metrics = {
    pagesParsed: options.pages.length,
    textItems: 0,
    layoutRows: 0,
    candidateRows: 0,
    contextRows: 0,
    drawbackRefundLines: 0,
    rejectedRows: 0
  };
  const warnings: string[] = [];
  const drawbackRefundLines: Schedule5DrawbackRefundLineV1[] = [];
  const pageMetrics: Schedule5ParsePageMetricsV1[] = [];
  let activeContexts: Schedule5DrawbackRefundContextV1[] = [];
  let activePart: Schedule5PartV1 = "unknown";

  for (const page of options.pages) {
    metrics.textItems += page.items.length;
    const pageRows = groupRows(page);
    metrics.layoutRows += pageRows.length;
    const currentPageMetrics: Schedule5ParsePageMetricsV1 = {
      pageNumber: page.pageNumber,
      textItems: page.items.length,
      layoutRows: pageRows.length,
      candidateRows: 0,
      contextRows: 0,
      drawbackRefundLines: 0,
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
      if (fields.item) {
        if (pending) {
          drawbackRefundLines.push(buildDrawbackRefundLine(pending, options.sourceDocumentSha256, pageDate));
          metrics.drawbackRefundLines += 1;
          currentPageMetrics.drawbackRefundLines += 1;
        }
        pending = null;

        if (isContextRow(row, layout, fields)) {
          const context = buildDrawbackRefundContext(row, layout, fields, activePart, options.sourceDocumentSha256);
          activeContexts = [...activeContexts.filter((item) => item.level < context.level), context];
          metrics.contextRows += 1;
          currentPageMetrics.contextRows += 1;
          continue;
        }

        metrics.candidateRows += 1;
        currentPageMetrics.candidateRows += 1;
        if (!isDrawbackRefundCandidate(fields)) {
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
      drawbackRefundLines.push(buildDrawbackRefundLine(pending, options.sourceDocumentSha256, pageDate));
      metrics.drawbackRefundLines += 1;
      currentPageMetrics.drawbackRefundLines += 1;
    }
    pageMetrics.push(currentPageMetrics);
  }

  if (!drawbackRefundLines.length) {
    warnings.push("No Schedule 5 drawback or refund lines were parsed from the supplied pages.");
  }

  return {
    schemaVersion: "za-customs.schedule5-parse-result.v1",
    drawbackRefundLines,
    warnings,
    metrics,
    pageMetrics
  };
}

interface RowFields {
  item: string;
  tariffHeading: string;
  code: string;
  checkDigit: string;
  description: string;
  extent: string;
}

interface PendingLine {
  part: Schedule5PartV1;
  pageNumber: number;
  row: LayoutRow;
  fields: RowFields;
  context: Schedule5DrawbackRefundContextV1[];
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
      if (text === "Drawback Item" || text === "Refund Item" || text === "Drawback" || text === "Refund") layout.item = item.column;
      if (text === "Tariff Heading" || text === "Tariff" || text === "Heading") layout.tariffHeading = item.column;
      if (text === "Code") layout.code = item.column;
      if (text === "CD") layout.checkDigit = item.column;
      if (text === "Description") layout.description = item.column;
      if (text.startsWith("Extent")) layout.extent = item.column;
    }
  }
  return layout;
}

function readRowFields(row: LayoutRow, layout: ColumnLayout): RowFields {
  return {
    item: readColumn(row, layout, "item"),
    tariffHeading: readColumn(row, layout, "tariffHeading"),
    code: readColumn(row, layout, "code"),
    checkDigit: readColumn(row, layout, "checkDigit"),
    description: readColumn(row, layout, "description"),
    extent: readColumn(row, layout, "extent")
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

function buildDrawbackRefundLine(
  pending: PendingLine,
  sourceDocumentSha256: string,
  pageDate?: string
): Schedule5DrawbackRefundLineV1 {
  const warnings: string[] = [];
  const descriptionParts = [pending.fields.description];
  const extentParts = [pending.fields.extent];

  for (const continuation of pending.continuationRows) {
    descriptionParts.push(continuation.fields.description);
    extentParts.push(continuation.fields.extent);
  }

  const description = compactJoin(descriptionParts);
  const extentOfRefundOrDrawback = compactJoin(extentParts);

  if (!pending.fields.checkDigit) warnings.push("Missing check digit.");
  if (!description) warnings.push("Missing description.");
  if (!extentOfRefundOrDrawback) warnings.push("Missing extent of refund or drawback.");
  if (pending.continuationRows.length) warnings.push("Description or extent text continued across layout rows.");

  return {
    schemaVersion: "za-customs.schedule5-drawback-refund-line.v1",
    part: pending.part,
    item: pending.fields.item,
    normalizedItem: normalizeDigits(pending.fields.item),
    tariffHeading: pending.fields.tariffHeading,
    normalizedTariffHeading: normalizeDigits(pending.fields.tariffHeading),
    code: pending.fields.code,
    normalizedCode: normalizeDigits(pending.fields.code),
    checkDigit: pending.fields.checkDigit || null,
    description,
    normalizedDescription: normalizeDescription(description),
    extentOfRefundOrDrawback,
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

function buildDrawbackRefundContext(
  row: LayoutRow,
  layout: ColumnLayout,
  fields: RowFields,
  part: Schedule5PartV1,
  sourceDocumentSha256: string
): Schedule5DrawbackRefundContextV1 {
  const description = readContextDescription(row, layout);
  return {
    part,
    item: fields.item,
    normalizedItem: normalizeDigits(fields.item),
    description,
    normalizedDescription: normalizeDescription(description),
    level: fields.item.endsWith(".00") ? 1 : 2,
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
  return /^(Date:|Drawback Item|Refund Item|Refund or|Drawback|Tariff Heading|Heading|Code|SCHEDULE 5|SPECIFIC DRAWBACKS|SPECIFIC REFUNDS|DRAWBACKS AND REFUNDS|NOTES?:|\d+\.\s+)/.test(text);
}

function isContextRow(row: LayoutRow, layout: ColumnLayout, fields: RowFields): boolean {
  return Boolean(isSchedule5Item(fields.item) && !isDrawbackRefundCandidate(fields) && readContextDescription(row, layout));
}

function isDrawbackRefundCandidate(fields: RowFields): boolean {
  return Boolean(
    isSchedule5Item(fields.item) &&
      looksLikeDottedNumber(fields.tariffHeading) &&
      looksLikeDottedNumber(fields.code) &&
      fields.description
  );
}

function isContinuationRow(fields: RowFields): boolean {
  return Boolean(!fields.item && (fields.description || fields.extent));
}

function isSchedule5Item(value: string): boolean {
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

function extractPart(text: string): Schedule5PartV1 | null {
  const match = text.match(/\bSCHEDULE 5\s*(?:\/\s*)?PART\s*([1-6])\b/i);
  return match ? (match[1] as Schedule5PartV1) : null;
}

function readContextDescription(row: LayoutRow, layout: ColumnLayout): string {
  const [, itemMax] = columnBounds(layout, "item");
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
