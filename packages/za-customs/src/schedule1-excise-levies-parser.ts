import { extractCustomsPdfTextItems, type CustomsPdfTextItem, type CustomsPdfTextPage } from "./pdf-text.js";
import type {
  DutyRateV1,
  Schedule1ExciseLevyContextV1,
  Schedule1ExciseLevyLineV1,
  Schedule1ExciseLeviesParsePageMetricsV1,
  Schedule1ExciseLeviesParseResultV1
} from "./types.js";

export interface ParseSchedule1ExciseLeviesPdfOptions {
  pdfPath: string;
  pages?: readonly number[];
}

export interface ParseSchedule1ExciseLeviesTextPagesOptions {
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

type ColumnName = "item" | "tariffSubheading" | "description" | "rate";
type ColumnLayout = Record<ColumnName, number>;

const DEFAULT_LAYOUT: ColumnLayout = {
  item: 39,
  tariffSubheading: 115,
  description: 210,
  rate: 702
};

const ROW_TOLERANCE = 2;
const CONTINUATION_ROW_GAP = 18;

export async function parseSchedule1ExciseLeviesPdf(
  options: ParseSchedule1ExciseLeviesPdfOptions
): Promise<Schedule1ExciseLeviesParseResultV1> {
  const extraction = await extractCustomsPdfTextItems(options);
  return parseSchedule1ExciseLeviesTextPages({
    pages: extraction.pages,
    sourceDocumentSha256: extraction.sourceDocumentSha256
  });
}

export function parseSchedule1ExciseLeviesTextPages(
  options: ParseSchedule1ExciseLeviesTextPagesOptions
): Schedule1ExciseLeviesParseResultV1 {
  const metrics = {
    pagesParsed: options.pages.length,
    textItems: 0,
    layoutRows: 0,
    candidateRows: 0,
    contextRows: 0,
    exciseLevyLines: 0,
    rejectedRows: 0
  };
  const warnings: string[] = [];
  const exciseLevyLines: Schedule1ExciseLevyLineV1[] = [];
  const pageMetrics: Schedule1ExciseLeviesParsePageMetricsV1[] = [];
  let activeContexts: Schedule1ExciseLevyContextV1[] = [];

  for (const page of options.pages) {
    metrics.textItems += page.items.length;
    const pageRows = groupRows(page);
    metrics.layoutRows += pageRows.length;
    const currentPageMetrics: Schedule1ExciseLeviesParsePageMetricsV1 = {
      pageNumber: page.pageNumber,
      textItems: page.items.length,
      layoutRows: pageRows.length,
      candidateRows: 0,
      contextRows: 0,
      exciseLevyLines: 0,
      rejectedRows: 0
    };
    const layout = detectColumnLayout(pageRows);
    const pageDate = options.validFrom ?? extractPageDate(page.items);
    const pagePart = extractPagePart(page.items) ?? "unknown";
    let pending: PendingLine | null = null;

    for (const row of pageRows) {
      if (isHeaderRow(row)) continue;

      const fields = readRowFields(row, layout);
      if (fields.item) {
        if (pending) {
          exciseLevyLines.push(buildExciseLine(pending, options.sourceDocumentSha256, pageDate));
          metrics.exciseLevyLines += 1;
          currentPageMetrics.exciseLevyLines += 1;
        }
        pending = null;

        if (isContextRow(fields)) {
          const context = buildExciseContext(row, fields, pagePart, options.sourceDocumentSha256);
          activeContexts = [...activeContexts.filter((item) => item.level < context.level), context];
          metrics.contextRows += 1;
          currentPageMetrics.contextRows += 1;
          continue;
        }

        metrics.candidateRows += 1;
        currentPageMetrics.candidateRows += 1;
        if (!isExciseLineCandidate(fields)) {
          metrics.rejectedRows += 1;
          currentPageMetrics.rejectedRows += 1;
          continue;
        }

        pending = {
          part: pagePart,
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
      exciseLevyLines.push(buildExciseLine(pending, options.sourceDocumentSha256, pageDate));
      metrics.exciseLevyLines += 1;
      currentPageMetrics.exciseLevyLines += 1;
    }
    pageMetrics.push(currentPageMetrics);
  }

  if (!exciseLevyLines.length) {
    warnings.push("No Schedule 1 excise or levy lines were parsed from the supplied pages.");
  }

  return {
    schemaVersion: "za-customs.schedule1-excise-levies-parse-result.v1",
    exciseLevyLines,
    warnings,
    metrics,
    pageMetrics
  };
}

interface RowFields {
  item: string;
  tariffSubheading: string;
  description: string;
  rate: string;
}

interface PendingLine {
  part: string;
  pageNumber: number;
  row: LayoutRow;
  fields: RowFields;
  context: Schedule1ExciseLevyContextV1[];
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
      if (text === "Tariff Item") layout.item = item.column;
      if (text === "Tariff Subheading" || text === "Subheading") layout.tariffSubheading = item.column;
      if (text === "Article Description") layout.description = item.column;
      if (text.startsWith("Rate of ")) layout.rate = item.column;
    }
  }
  return layout;
}

function readRowFields(row: LayoutRow, layout: ColumnLayout): RowFields {
  return {
    item: readColumn(row, layout, "item"),
    tariffSubheading: readColumn(row, layout, "tariffSubheading"),
    description: readColumn(row, layout, "description"),
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

function buildExciseLine(
  pending: PendingLine,
  sourceDocumentSha256: string,
  pageDate?: string
): Schedule1ExciseLevyLineV1 {
  const warnings: string[] = [];
  const descriptionParts = [pending.fields.description];
  const rateParts = [pending.fields.rate];

  for (const continuation of pending.continuationRows) {
    if (continuation.fields.description) descriptionParts.push(continuation.fields.description);
    if (continuation.fields.rate) rateParts.push(continuation.fields.rate);
  }

  const description = compactJoin(descriptionParts);
  const rate = parseExciseDutyRate(compactJoin(rateParts), warnings);

  if (!description) warnings.push("Missing article description.");
  if (pending.continuationRows.length) warnings.push("Description or rate text continued across layout rows.");

  const lineWarnings = Array.from(new Set([...warnings, ...rate.warnings]));
  return {
    schemaVersion: "za-customs.schedule1-excise-levy-line.v1",
    part: pending.part,
    item: pending.fields.item,
    normalizedItem: normalizeDigits(pending.fields.item),
    tariffSubheading: pending.fields.tariffSubheading,
    normalizedTariffSubheading: normalizeDigits(pending.fields.tariffSubheading),
    description,
    normalizedDescription: normalizeDescription(description),
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

function buildExciseContext(
  row: LayoutRow,
  fields: RowFields,
  part: string,
  sourceDocumentSha256: string
): Schedule1ExciseLevyContextV1 {
  const description = compactJoin([fields.tariffSubheading, fields.description, fields.rate]);
  return {
    part,
    item: fields.item,
    normalizedItem: normalizeDigits(fields.item),
    description,
    normalizedDescription: normalizeDescription(description),
    level: fields.item.endsWith(".00") ? 1 : fields.item.split(".").length,
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

function parseExciseDutyRate(raw: string, warnings: string[]): DutyRateV1 {
  const rateWarnings: string[] = [];
  const normalized = raw.trim();
  if (!normalized) {
    rateWarnings.push("Missing excise duty rate.");
    warnings.push(...rateWarnings);
    return { raw: normalized, kind: "unknown", components: [], warnings: rateWarnings };
  }

  if (/^free$/i.test(normalized)) {
    return { raw: normalized, kind: "free", components: [], warnings: [] };
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

  const cents = normalized.match(/^(\d+(?:[,.]\d+)?)c\/(?:(\d+))?(.+)$/i);
  if (cents) {
    return {
      raw: normalized,
      kind: "specific",
      components: [
        {
          amount: Number(cents[1].replace(",", ".")),
          currency: "ZAc",
          perQuantity: cents[2] ? Number(cents[2]) : 1,
          unit: normalizeRateUnit(cents[3])
        }
      ],
      warnings: []
    };
  }

  const rand = normalized.match(/^R\s*([\d\s]+(?:[,.]\d+)?)\/(?:(\d+))?(.+)$/i);
  if (rand) {
    return {
      raw: normalized,
      kind: "specific",
      components: [
        {
          amount: Number(rand[1].replace(/\s/g, "").replace(",", ".")),
          currency: "ZAR",
          perQuantity: rand[2] ? Number(rand[2]) : 1,
          unit: normalizeRateUnit(rand[3])
        }
      ],
      warnings: []
    };
  }

  rateWarnings.push(`Unclassified excise duty rate text: ${normalized}`);
  warnings.push(...rateWarnings);
  return { raw: normalized, kind: /%|formula|note/i.test(normalized) ? "formula" : "unknown", components: [], warnings: rateWarnings };
}

function isHeaderRow(row: LayoutRow): boolean {
  const text = rawRowText([row]);
  return /^(Date:|Tariff Item|Tariff Subheading|Subheading|Article Description|Rate of |SCHEDULE 1|SECTION A|SPECIFIC EXCISE|NOTES?:|\d+\.\s+)/.test(text);
}

function isContextRow(fields: RowFields): boolean {
  return Boolean(looksLikeExciseItem(fields.item) && !isExciseLineCandidate(fields) && contextDescription(fields));
}

function isExciseLineCandidate(fields: RowFields): boolean {
  return Boolean(isExciseLineItem(fields.item) && fields.tariffSubheading && fields.description);
}

function isContinuationRow(fields: RowFields): boolean {
  return Boolean(!fields.item && (fields.description || fields.rate));
}

function contextDescription(fields: RowFields): string {
  return compactJoin([fields.tariffSubheading, fields.description, fields.rate]);
}

function looksLikeExciseItem(value: string): boolean {
  return /^\d{3}\.\d{2}(?:\.\d{1,2})?$/.test(value);
}

function isExciseLineItem(value: string): boolean {
  return /^\d{3}\.\d{2}\.\d{2}$/.test(value);
}

function extractPageDate(items: readonly CustomsPdfTextItem[]): string | undefined {
  for (const item of items) {
    const match = item.text.match(/\bDate:\s*(\d{4}-\d{2}-\d{2})\b/);
    if (match) return match[1];
  }
  return undefined;
}

function extractPagePart(items: readonly CustomsPdfTextItem[]): string | undefined {
  for (const item of items) {
    const match = item.text.match(/\bSCHEDULE 1\s*(?:\/\s*)?PART\s*([0-9A-Z]+)\b/i);
    if (match) return match[1].toUpperCase();
  }
  return undefined;
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

function normalizeRateUnit(unit: string): string {
  return unit.trim().replace(/\s+/g, " ");
}

function calculateParseConfidence(warnings: readonly string[]): number {
  const penalty = warnings.reduce((total, warning) => total + warningPenalty(warning), 0);
  return Math.max(0, Number((1 - penalty).toFixed(2)));
}

function warningPenalty(warning: string): number {
  if (warning.startsWith("Missing")) return 0.25;
  if (warning.startsWith("Unclassified")) return 0.2;
  if (warning.startsWith("Description or rate text continued")) return 0.1;
  return 0.05;
}

function average(left: number, right: number): number {
  return (left + right) / 2;
}
