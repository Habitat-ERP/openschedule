import type { DutyRateV1, Schedule1ParseResultV1, TariffLineContextV1, TariffLineV1 } from "./types.js";
import { extractCustomsPdfTextItems, type CustomsPdfTextItem, type CustomsPdfTextPage } from "./pdf-text.js";

export interface ParseSchedule1Part1PdfOptions {
  pdfPath: string;
  pages?: readonly number[];
}

export interface ParseSchedule1Part1TextPagesOptions {
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
  | "tariffCode"
  | "checkDigit"
  | "description"
  | "statisticalUnit"
  | "general"
  | "euUk"
  | "efta"
  | "sadc"
  | "mercosur"
  | "afcfta";

type ColumnLayout = Record<ColumnName, number>;

const DEFAULT_LAYOUT: ColumnLayout = {
  tariffCode: 39,
  checkDigit: 118,
  description: 142,
  statisticalUnit: 448,
  general: 486,
  euUk: 537,
  efta: 589,
  sadc: 640,
  mercosur: 692,
  afcfta: 759
};

const RATE_COLUMNS = ["general", "euUk", "efta", "sadc", "mercosur", "afcfta"] as const;
const ROW_TOLERANCE = 2;
const CONTINUATION_ROW_GAP = 18;

export async function parseSchedule1Part1Pdf(
  options: ParseSchedule1Part1PdfOptions
): Promise<Schedule1ParseResultV1> {
  const extraction = await extractCustomsPdfTextItems(options);
  return parseSchedule1Part1TextPages({
    pages: extraction.pages,
    sourceDocumentSha256: extraction.sourceDocumentSha256
  });
}

export function parseSchedule1Part1TextPages(
  options: ParseSchedule1Part1TextPagesOptions
): Schedule1ParseResultV1 {
  const metrics = {
    pagesParsed: options.pages.length,
    textItems: 0,
    layoutRows: 0,
    candidateRows: 0,
    contextRows: 0,
    tariffLines: 0,
    rejectedRows: 0
  };
  const warnings: string[] = [];
  const tariffLines: TariffLineV1[] = [];
  let activeContexts: TariffLineContextV1[] = [];

  for (const page of options.pages) {
    metrics.textItems += page.items.length;
    const pageRows = groupRows(page);
    metrics.layoutRows += pageRows.length;
    const layout = detectColumnLayout(pageRows);
    const pageDate = options.validFrom ?? extractPageDate(page.items);

    let pending: PendingLine | null = null;
    let pendingContext: PendingContext | null = null;
    for (const row of pageRows) {
      if (isHeaderRow(row)) {
        continue;
      }

      const fields = readRowFields(row, layout);
      if (fields.tariffCode) {
        if (pending) {
          const line = buildTariffLine(pending, options.sourceDocumentSha256, pageDate);
          tariffLines.push(line);
          metrics.tariffLines += 1;
        }

        metrics.candidateRows += 1;
        if (isHierarchyContext(row, layout, fields)) {
          const context = buildTariffLineContext(row, layout, fields, options.sourceDocumentSha256);
          activeContexts = [...activeContexts.filter((item) => item.level < context.level), context];
          pendingContext = {
            context,
            rows: [row],
            lastRow: row.row
          };
          metrics.contextRows += 1;
          pending = null;
          continue;
        }

        if (!isTariffCandidate(fields)) {
          metrics.rejectedRows += 1;
          pending = null;
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
        pendingContext = null;
        continue;
      }

      if (pending && row.row - pending.lastRow <= CONTINUATION_ROW_GAP) {
        const continuation = readRowFields(row, layout);
        if (continuation.description || RATE_COLUMNS.some((column) => continuation[column])) {
          pending.continuationRows.push({ row, fields: continuation });
          pending.lastRow = row.row;
        }
        continue;
      }

      if (pendingContext && row.row - pendingContext.lastRow <= CONTINUATION_ROW_GAP) {
        const continuation = readContextDescription(row, layout);
        if (continuation) {
          pendingContext.rows.push(row);
          pendingContext.lastRow = row.row;
          pendingContext.context.description = compactJoin([pendingContext.context.description, continuation]);
          pendingContext.context.normalizedDescription = normalizeDescription(pendingContext.context.description);
          pendingContext.context.sourceTrace[0].locator = rowLocator(pendingContext.rows);
          pendingContext.context.sourceTrace[0].text = rawRowText(pendingContext.rows);
        }
      }
    }

    if (pending) {
      const line = buildTariffLine(pending, options.sourceDocumentSha256, pageDate);
      tariffLines.push(line);
      metrics.tariffLines += 1;
    }
  }

  if (!tariffLines.length) {
    warnings.push("No tariff lines were parsed from the supplied pages.");
  }

  return {
    schemaVersion: "za-customs.schedule1-parse-result.v1",
    tariffLines,
    warnings,
    metrics
  };
}

interface RowFields {
  tariffCode: string;
  checkDigit: string;
  description: string;
  statisticalUnit: string;
  general: string;
  euUk: string;
  efta: string;
  sadc: string;
  mercosur: string;
  afcfta: string;
}

interface PendingLine {
  pageNumber: number;
  row: LayoutRow;
  fields: RowFields;
  context: TariffLineContextV1[];
  continuationRows: Array<{
    row: LayoutRow;
    fields: RowFields;
  }>;
  lastRow: number;
}

interface PendingContext {
  context: TariffLineContextV1;
  rows: LayoutRow[];
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
      if (text === "CD") layout.checkDigit = item.column;
      if (text === "Article Description") layout.description = item.column;
      if (text === "Unit") layout.statisticalUnit = item.column;
      if (text === "General") layout.general = item.column;
      if (text === "EU / UK") layout.euUk = item.column;
      if (text === "EFTA") layout.efta = item.column;
      if (text === "SADC") layout.sadc = item.column;
      if (text === "MERCOSUR") layout.mercosur = item.column;
      if (text === "AfCFTA") layout.afcfta = item.column;
    }
  }
  return layout;
}

function readRowFields(row: LayoutRow, layout: ColumnLayout): RowFields {
  return {
    tariffCode: readColumn(row, layout, "tariffCode"),
    checkDigit: readColumn(row, layout, "checkDigit"),
    description: readColumn(row, layout, "description"),
    statisticalUnit: readColumn(row, layout, "statisticalUnit"),
    general: readColumn(row, layout, "general"),
    euUk: readColumn(row, layout, "euUk"),
    efta: readColumn(row, layout, "efta"),
    sadc: readColumn(row, layout, "sadc"),
    mercosur: readColumn(row, layout, "mercosur"),
    afcfta: readColumn(row, layout, "afcfta")
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

function buildTariffLine(pending: PendingLine, sourceDocumentSha256: string, pageDate?: string): TariffLineV1 {
  const warnings: string[] = [];
  const descriptionParts = [pending.fields.description];
  const rateParts: Record<(typeof RATE_COLUMNS)[number], string[]> = {
    general: [pending.fields.general],
    euUk: [pending.fields.euUk],
    efta: [pending.fields.efta],
    sadc: [pending.fields.sadc],
    mercosur: [pending.fields.mercosur],
    afcfta: [pending.fields.afcfta]
  };

  for (const continuation of pending.continuationRows) {
    if (continuation.fields.description) {
      descriptionParts.push(continuation.fields.description);
    }
    for (const column of RATE_COLUMNS) {
      if (continuation.fields[column]) {
        rateParts[column].push(continuation.fields[column]);
      }
    }
  }

  const description = compactJoin(descriptionParts);
  const normalizedDescription = normalizeDescription(description);
  if (!description) warnings.push("Missing article description.");
  if (!pending.fields.checkDigit) warnings.push("Missing check digit.");
  if (!pending.fields.statisticalUnit) warnings.push("Missing statistical unit.");
  if (pending.continuationRows.length) warnings.push("Description or rate text continued across layout rows.");

  const rates = {
    general: parseDutyRate(compactJoin(rateParts.general), warnings, "general"),
    euUk: parseOptionalDutyRate(compactJoin(rateParts.euUk), warnings, "euUk"),
    efta: parseOptionalDutyRate(compactJoin(rateParts.efta), warnings, "efta"),
    sadc: parseOptionalDutyRate(compactJoin(rateParts.sadc), warnings, "sadc"),
    mercosur: parseOptionalDutyRate(compactJoin(rateParts.mercosur), warnings, "mercosur"),
    afcfta: parseOptionalDutyRate(compactJoin(rateParts.afcfta), warnings, "afcfta")
  };

  const lineWarnings = Array.from(new Set([...warnings, ...Object.values(rates).flatMap((rate) => rate?.warnings ?? [])]));
  return {
    schemaVersion: "za-customs.tariff-line.v1",
    tariffCode: pending.fields.tariffCode,
    normalizedTariffCode: pending.fields.tariffCode.replace(/\D/g, ""),
    checkDigit: pending.fields.checkDigit || null,
    description,
    normalizedDescription,
    statisticalUnit: pending.fields.statisticalUnit || null,
    rates: removeUndefinedRates(rates),
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
    parseConfidence: Math.max(0, 1 - lineWarnings.length * 0.12),
    warnings: lineWarnings
  };
}

function buildTariffLineContext(
  row: LayoutRow,
  layout: ColumnLayout,
  fields: RowFields,
  sourceDocumentSha256: string
): TariffLineContextV1 {
  const description = readContextDescription(row, layout);
  return {
    code: fields.tariffCode,
    normalizedCode: fields.tariffCode.replace(/\D/g, ""),
    description,
    normalizedDescription: normalizeDescription(description),
    level: fields.tariffCode.replace(/\D/g, "").length,
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

function parseOptionalDutyRate(raw: string, warnings: string[], column: string): DutyRateV1 | undefined {
  return raw ? parseDutyRate(raw, warnings, column) : undefined;
}

function parseDutyRate(raw: string, warnings: string[], column: string): DutyRateV1 {
  const rateWarnings: string[] = [];
  if (!raw) {
    rateWarnings.push(`Missing ${column} rate.`);
    warnings.push(...rateWarnings);
    return { raw, kind: "unknown", components: [], warnings: rateWarnings };
  }

  const normalized = raw.trim();
  if (/^free$/i.test(normalized)) {
    return { raw: normalized, kind: "free", components: [], warnings: [] };
  }

  const qualifiedFree = normalized.match(/^free\s+to\s+(.+)$/i);
  if (qualifiedFree) {
    rateWarnings.push(`Qualified ${column} rate text requires manual agreement/member interpretation.`);
    warnings.push(...rateWarnings);
    return {
      raw: normalized,
      kind: "formula",
      components: [{ basis: "qualified_free", qualifier: qualifiedFree[1] }],
      warnings: rateWarnings
    };
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

  const qualifiedPercent = normalized.match(/^(\d+(?:[,.]\d+)?)%\s+to\s+(.+)$/i);
  if (qualifiedPercent) {
    rateWarnings.push(`Qualified ${column} rate text requires manual agreement/member interpretation.`);
    warnings.push(...rateWarnings);
    return {
      raw: normalized,
      kind: "formula",
      components: [
        {
          basis: "customs_value",
          rate: Number(qualifiedPercent[1].replace(",", ".")) / 100,
          qualifier: qualifiedPercent[2]
        }
      ],
      warnings: rateWarnings
    };
  }

  const specificComponents = parseSpecificComponents(normalized);
  if (specificComponents.length && !/%|\bor\b|\bplus\b|\bwith\b/i.test(normalized)) {
    return { raw: normalized, kind: "specific", components: specificComponents, warnings: [] };
  }

  const compoundComponents = [...parseAdValoremComponents(normalized), ...specificComponents];
  if (compoundComponents.length > 1 || /\bor\b|\bplus\b|\bmaximum\b|\bminimum\b/i.test(normalized)) {
    return { raw: normalized, kind: "compound", components: compoundComponents, warnings: [] };
  }

  const kind = /%|formula|note/i.test(normalized) ? "formula" : "unknown";
  rateWarnings.push(`Unclassified ${column} rate text: ${normalized}`);
  warnings.push(...rateWarnings);
  return { raw: normalized, kind, components: [], warnings: rateWarnings };
}

function parseAdValoremComponents(raw: string): Array<Record<string, unknown>> {
  return Array.from(raw.matchAll(/(\d+(?:[,.]\d+)?)%/g)).map((match) => ({
    basis: "customs_value",
    rate: Number(match[1].replace(",", ".")) / 100
  }));
}

function parseSpecificComponents(raw: string): Array<Record<string, unknown>> {
  return Array.from(raw.matchAll(/(\d+(?:[,.]\d+)?)c\/(?:(\d+))?([A-Za-z]+)/g)).map((match) => ({
    amount: Number(match[1].replace(",", ".")),
    currency: "ZAc",
    perQuantity: match[2] ? Number(match[2]) : 1,
    unit: match[3]
  }));
}

function removeUndefinedRates(rates: {
  general: DutyRateV1;
  euUk?: DutyRateV1;
  efta?: DutyRateV1;
  sadc?: DutyRateV1;
  mercosur?: DutyRateV1;
  afcfta?: DutyRateV1;
}): TariffLineV1["rates"] {
  return Object.fromEntries(Object.entries(rates).filter(([, value]) => value)) as TariffLineV1["rates"];
}

function isHeaderRow(row: LayoutRow): boolean {
  const text = rawRowText([row]);
  return /^(Date:|Heading \/|Subheading|Rate of Duty|SCHEDULE 1|Customs & Excise Tariff)/.test(text);
}

function isTariffCandidate(fields: RowFields): boolean {
  return isTariffCode(fields.tariffCode) && /^\d$/.test(fields.checkDigit) && Boolean(fields.general || fields.description);
}

function isHierarchyContext(row: LayoutRow, layout: ColumnLayout, fields: RowFields): boolean {
  return Boolean(fields.tariffCode && !fields.checkDigit && readContextDescription(row, layout));
}

function isTariffCode(value: string): boolean {
  const normalized = value.replace(/\D/g, "");
  return /^\d{4}(?:\.\d{2}){1,2}$/.test(value) && normalized.length >= 6;
}

function extractPageDate(items: readonly CustomsPdfTextItem[]): string | undefined {
  for (const item of items) {
    const match = item.text.match(/\bDate:\s*(\d{4}-\d{2}-\d{2})\b/);
    if (match) return match[1];
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

function readContextDescription(row: LayoutRow, layout: ColumnLayout): string {
  const [, tariffCodeMax] = columnBounds(layout, "tariffCode");
  return joinFragments(row.items.filter((item) => item.column >= tariffCodeMax));
}

function joinFragments(items: readonly NormalizedItem[]): string {
  return compactJoin(items.map((item) => item.text));
}

function compactJoin(parts: readonly string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
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

function average(left: number, right: number): number {
  return (left + right) / 2;
}
