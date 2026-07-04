import { extractCustomsPdfTextItems, type CustomsPdfTextItem, type CustomsPdfTextPage } from "./pdf-text.js";
import type {
  DutyRateV1,
  Schedule2ParsePageMetricsV1,
  Schedule2ParseResultV1,
  Schedule2TradeRemedyContextV1,
  Schedule2TradeRemedyLineV1
} from "./types.js";

export interface ParseSchedule2TradeRemediesPdfOptions {
  pdfPath: string;
  pages?: readonly number[];
}

export interface ParseSchedule2TradeRemediesTextPagesOptions {
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

type ColumnName =
  | "item"
  | "tariffHeading"
  | "code"
  | "checkDigit"
  | "description"
  | "rebateItems"
  | "originatingCountry"
  | "rate";

type ColumnLayout = Record<ColumnName, number>;

const DEFAULT_LAYOUT: ColumnLayout = {
  item: 39,
  tariffHeading: 82,
  code: 146,
  checkDigit: 190,
  description: 210,
  rebateItems: 531,
  originatingCountry: 617,
  rate: 702
};

const ROW_TOLERANCE = 2;
const CONTINUATION_ROW_GAP = 18;

export async function parseSchedule2TradeRemediesPdf(
  options: ParseSchedule2TradeRemediesPdfOptions
): Promise<Schedule2ParseResultV1> {
  const extraction = await extractCustomsPdfTextItems(options);
  return parseSchedule2TradeRemediesTextPages({
    pages: extraction.pages,
    sourceDocumentSha256: extraction.sourceDocumentSha256
  });
}

export function parseSchedule2TradeRemediesTextPages(
  options: ParseSchedule2TradeRemediesTextPagesOptions
): Schedule2ParseResultV1 {
  const metrics = {
    pagesParsed: options.pages.length,
    textItems: 0,
    layoutRows: 0,
    candidateRows: 0,
    contextRows: 0,
    tradeRemedyLines: 0,
    rejectedRows: 0
  };
  const warnings: string[] = [];
  const tradeRemedyLines: Schedule2TradeRemedyLineV1[] = [];
  const pageMetrics: Schedule2ParsePageMetricsV1[] = [];
  let activeContexts: Schedule2TradeRemedyContextV1[] = [];

  for (const page of options.pages) {
    metrics.textItems += page.items.length;
    const pageRows = groupRows(page);
    metrics.layoutRows += pageRows.length;
    const currentPageMetrics: Schedule2ParsePageMetricsV1 = {
      pageNumber: page.pageNumber,
      textItems: page.items.length,
      layoutRows: pageRows.length,
      candidateRows: 0,
      contextRows: 0,
      tradeRemedyLines: 0,
      rejectedRows: 0
    };
    const layout = detectColumnLayout(pageRows);
    const pageDate = options.validFrom ?? extractPageDate(page.items);
    let pending: PendingLine | null = null;

    for (const row of pageRows) {
      if (isHeaderRow(row)) continue;

      const fields = readRowFields(row, layout);
      if (fields.item) {
        if (pending) {
          tradeRemedyLines.push(buildTradeRemedyLine(pending, options.sourceDocumentSha256, pageDate));
          metrics.tradeRemedyLines += 1;
          currentPageMetrics.tradeRemedyLines += 1;
        }
        pending = null;

        if (isContextRow(row, layout, fields)) {
          const context = buildTradeRemedyContext(row, layout, fields, options.sourceDocumentSha256);
          activeContexts = [...activeContexts.filter((item) => item.level < context.level), context];
          metrics.contextRows += 1;
          currentPageMetrics.contextRows += 1;
          continue;
        }

        metrics.candidateRows += 1;
        currentPageMetrics.candidateRows += 1;
        if (!isTradeRemedyCandidate(fields)) {
          metrics.rejectedRows += 1;
          currentPageMetrics.rejectedRows += 1;
          continue;
        }

        pending = {
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
      tradeRemedyLines.push(buildTradeRemedyLine(pending, options.sourceDocumentSha256, pageDate));
      metrics.tradeRemedyLines += 1;
      currentPageMetrics.tradeRemedyLines += 1;
    }
    pageMetrics.push(currentPageMetrics);
  }

  if (!tradeRemedyLines.length) {
    warnings.push("No Schedule 2 trade remedy lines were parsed from the supplied pages.");
  }

  return {
    schemaVersion: "za-customs.schedule2-parse-result.v1",
    tradeRemedyLines,
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
  rebateItems: string;
  originatingCountry: string;
  rate: string;
}

interface PendingLine {
  pageNumber: number;
  row: LayoutRow;
  fields: RowFields;
  context: Schedule2TradeRemedyContextV1[];
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
  for (const row of rows.slice(0, 8)) {
    for (const item of row.items) {
      const text = item.text.trim();
      if (text === "Item") layout.item = item.column;
      if (text === "Tariff Heading") layout.tariffHeading = item.column;
      if (text === "Code") layout.code = item.column;
      if (text === "CD") layout.checkDigit = item.column;
      if (text === "Description") layout.description = item.column;
      if (text === "Rebate Items") layout.rebateItems = item.column;
      if (text === "Imported from or") layout.originatingCountry = item.column;
      if (text.startsWith("Rate of ")) layout.rate = item.column;
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
    rebateItems: readColumn(row, layout, "rebateItems"),
    originatingCountry: readColumn(row, layout, "originatingCountry"),
    rate: readColumn(row, layout, "rate")
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

function buildTradeRemedyLine(
  pending: PendingLine,
  sourceDocumentSha256: string,
  pageDate?: string
): Schedule2TradeRemedyLineV1 {
  const warnings: string[] = [];
  const descriptionParts = [pending.fields.description];
  const rebateParts = [pending.fields.rebateItems];
  const originParts = [pending.fields.originatingCountry];
  const rateParts = [pending.fields.rate];

  for (const continuation of pending.continuationRows) {
    descriptionParts.push(continuation.fields.description);
    rebateParts.push(continuation.fields.rebateItems);
    originParts.push(continuation.fields.originatingCountry);
    rateParts.push(continuation.fields.rate);
  }

  const description = compactJoin(descriptionParts);
  const originatingCountryOrTerritory = compactJoin(originParts);
  const rate = parseDutyRate(compactJoin(rateParts), warnings, "anti-dumping duty");

  if (!pending.fields.checkDigit) warnings.push("Missing check digit.");
  if (!description) warnings.push("Missing description.");
  if (!originatingCountryOrTerritory) warnings.push("Missing originating country or territory.");
  if (pending.continuationRows.length) warnings.push("Description or column text continued across layout rows.");

  const lineWarnings = Array.from(new Set([...warnings, ...rate.warnings]));
  return {
    schemaVersion: "za-customs.schedule2-trade-remedy-line.v1",
    item: pending.fields.item,
    normalizedItem: normalizeDigits(pending.fields.item),
    tariffHeading: pending.fields.tariffHeading,
    normalizedTariffHeading: normalizeDigits(pending.fields.tariffHeading),
    code: pending.fields.code,
    normalizedCode: normalizeDigits(pending.fields.code),
    checkDigit: pending.fields.checkDigit || null,
    description,
    normalizedDescription: normalizeDescription(description),
    rebateItems: splitList(compactJoin(rebateParts)),
    originatingCountryOrTerritory,
    rate,
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
    parseConfidence: calculateParseConfidence(lineWarnings),
    warnings: lineWarnings
  };
}

function buildTradeRemedyContext(
  row: LayoutRow,
  layout: ColumnLayout,
  fields: RowFields,
  sourceDocumentSha256: string
): Schedule2TradeRemedyContextV1 {
  const description = readContextDescription(row, layout);
  return {
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

function parseDutyRate(raw: string, warnings: string[], label: string): DutyRateV1 {
  const rateWarnings: string[] = [];
  const normalized = raw.trim();
  if (!normalized) {
    rateWarnings.push(`Missing ${label} rate.`);
    warnings.push(...rateWarnings);
    return { raw: normalized, kind: "unknown", components: [], warnings: rateWarnings };
  }

  const percent = normalized.match(/^(\d+(?:[,.]\d+)?)%$/);
  if (percent) {
    return {
      raw: normalized,
      kind: "ad_valorem",
      components: [{ basis: "customs_value", rate: Number(percent[1].replace(",", ".")) / 100 }],
      warnings: []
    };
  }

  const cents = normalized.match(/^(\d+(?:[,.]\d+)?)c\/(?:(\d+))?([A-Za-z.]+)$/);
  if (cents) {
    return {
      raw: normalized,
      kind: "specific",
      components: [{ amount: Number(cents[1].replace(",", ".")), currency: "ZAc", perQuantity: cents[2] ? Number(cents[2]) : 1, unit: cents[3] }],
      warnings: []
    };
  }

  const rand = normalized.match(/^R\s*([\d\s]+(?:[,.]\d+)?)\/(?:(\d+))?([A-Za-z.]+)$/);
  if (rand) {
    return {
      raw: normalized,
      kind: "specific",
      components: [{ amount: Number(rand[1].replace(/\s/g, "").replace(",", ".")), currency: "ZAR", perQuantity: rand[2] ? Number(rand[2]) : 1, unit: rand[3] }],
      warnings: []
    };
  }

  rateWarnings.push(`Unclassified ${label} rate text: ${normalized}`);
  warnings.push(...rateWarnings);
  return { raw: normalized, kind: /%|formula|note/i.test(normalized) ? "formula" : "unknown", components: [], warnings: rateWarnings };
}

function isHeaderRow(row: LayoutRow): boolean {
  const text = rawRowText([row]);
  return /^(Date:|Item\s+Tariff Heading|Tariff Heading|Originating in|Rate of |SCHEDULE 2|ANTI-DUMPING|NOTES?:|\d+\.\s+)/.test(text);
}

function isContextRow(row: LayoutRow, layout: ColumnLayout, fields: RowFields): boolean {
  return Boolean(isSchedule2Item(fields.item) && !isTradeRemedyCandidate(fields) && readContextDescription(row, layout));
}

function isTradeRemedyCandidate(fields: RowFields): boolean {
  return Boolean(
    isSchedule2Item(fields.item) &&
      looksLikeDottedNumber(fields.tariffHeading) &&
      looksLikeDottedNumber(fields.code) &&
      fields.description &&
      fields.originatingCountry &&
      fields.rate
  );
}

function isContinuationRow(fields: RowFields): boolean {
  return Boolean(!fields.item && (fields.description || fields.rebateItems || fields.originatingCountry || fields.rate));
}

function isSchedule2Item(value: string): boolean {
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

function splitList(value: string): string[] {
  return value.split(";").map((item) => item.trim()).filter(Boolean);
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
  if (warning.startsWith("Unclassified")) return 0.24;
  if (warning.startsWith("Description or column text continued")) return 0.1;
  return 0.12;
}

function average(left: number, right: number): number {
  return (left + right) / 2;
}
