import { createHash, randomUUID } from "node:crypto";
import { constants, closeSync, openSync, readSync } from "node:fs";
import { access, mkdir, open as openFile, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import type { RulesetManifestV1 } from "@openschedule/core";
import { hashFileSha256 } from "@openschedule/core";
import {
  allCustomsMeasures,
  customsMeasureLimit,
  matchesCustomsMeasureFilter,
  publicCustomsMeasure,
  type InternalZaCustomsMeasure,
  type ZaCustomsMeasureFilter,
  type ZaCustomsMeasurePage
} from "./measures.js";
import type { CustomsRulesetContainerV1, TariffLineV1 } from "./types.js";

export const ZA_CUSTOMS_MANIFEST_FILE = "za-customs.manifest.json";
export const ZA_CUSTOMS_TARIFF_LINES_FILE = "tariff-lines.ndjson";
export const ZA_CUSTOMS_TARIFF_LINES_INDEX_FILE = "tariff-lines.idx.json";
export const ZA_CUSTOMS_MEASURES_FILE = "measures.ndjson";
export const ZA_CUSTOMS_LEGACY_CONTAINER_FILE = "za-customs.json";

export interface ZaCustomsCachePaths {
  root: string;
  sources: string;
  tmp: string;
  manifest: string;
  tariffLines: string;
  tariffLinesIndex: string;
  measures: string;
  legacyContainer: string;
}

export interface CacheFileRef {
  path: string;
  bytes: number;
  sha256: string;
}

export interface ZaCustomsCacheManifestV1 {
  schemaVersion: "za-customs.cache-manifest.v1";
  rulesetManifest: RulesetManifestV1;
  containerSchemaVersion: CustomsRulesetContainerV1["schemaVersion"];
  encoding: "utf8";
  lineTerminator: "\n";
  resolvedEffectiveDate: string;
  files: {
    tariffLines: CacheFileRef;
    tariffLinesIndex: CacheFileRef;
    measures: CacheFileRef;
  };
  scheduleSummaries: {
    schedule1Part1: { tariffLines: number };
    schedule1ExciseLevies?: { exciseLevyLines: number };
    schedule2?: { tradeRemedyLines: number };
    schedule3?: { rebateLines: number };
    schedule4?: { rebateLines: number };
    schedule5?: { drawbackRefundLines: number };
    schedule6?: { exciseRebateRefundLines: number };
  };
}

export interface TariffLineSpanV1 {
  row: number;
  offset: number;
  length: number;
  tariffCode: string;
  normalizedTariffCode: string;
  validFrom: string;
  validTo?: string | null;
  recordSha256: string;
}

export interface TariffLinesIndexV1 {
  schemaVersion: "za-customs.tariff-lines-index.v1";
  rulesetId: string;
  recordCount: number;
  byNormalizedTariffCode: Record<string, TariffLineSpanV1[]>;
}

export interface ZaCustomsCacheArtifacts {
  paths: ZaCustomsCachePaths;
  manifest: ZaCustomsCacheManifestV1;
  tariffLinesIndex: TariffLinesIndexV1;
}

export interface ZaCustomsTariffLineArtifactFilter {
  effectiveDate?: string;
  limit?: number;
  cursor?: string;
}

export interface ZaCustomsTariffLineArtifactPage {
  items: TariffLineV1[];
  nextCursor: string | null;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function zaCustomsCachePaths(root: string): ZaCustomsCachePaths {
  return {
    root,
    sources: join(root, "sources"),
    tmp: join(root, "tmp"),
    manifest: join(root, ZA_CUSTOMS_MANIFEST_FILE),
    tariffLines: join(root, ZA_CUSTOMS_TARIFF_LINES_FILE),
    tariffLinesIndex: join(root, ZA_CUSTOMS_TARIFF_LINES_INDEX_FILE),
    measures: join(root, ZA_CUSTOMS_MEASURES_FILE),
    legacyContainer: join(root, ZA_CUSTOMS_LEGACY_CONTAINER_FILE)
  };
}

export async function writeCacheArtifacts(
  paths: ZaCustomsCachePaths,
  container: CustomsRulesetContainerV1
): Promise<ZaCustomsCacheArtifacts> {
  await mkdir(paths.root, { recursive: true });
  await mkdir(paths.tmp, { recursive: true });

  const tariffLinesTmp = tmpPath(paths, paths.tariffLines);
  const indexTmp = tmpPath(paths, paths.tariffLinesIndex);
  const measuresTmp = tmpPath(paths, paths.measures);
  const manifestTmp = tmpPath(paths, paths.manifest);

  const tariffLinesIndex = await writeTariffLinesNdjson(tariffLinesTmp, container);
  await writeJson(indexTmp, tariffLinesIndex);
  await writeMeasuresNdjson(measuresTmp, container);

  await rename(tariffLinesTmp, paths.tariffLines);
  await rename(indexTmp, paths.tariffLinesIndex);
  await rename(measuresTmp, paths.measures);

  const manifest: ZaCustomsCacheManifestV1 = {
    schemaVersion: "za-customs.cache-manifest.v1",
    rulesetManifest: container.manifest,
    containerSchemaVersion: container.schemaVersion,
    encoding: "utf8",
    lineTerminator: "\n",
    resolvedEffectiveDate: resolvedEffectiveDate(container),
    files: {
      tariffLines: await fileRef(paths.tariffLines),
      tariffLinesIndex: await fileRef(paths.tariffLinesIndex),
      measures: await fileRef(paths.measures)
    },
    scheduleSummaries: scheduleSummaries(container)
  };
  await writeJson(manifestTmp, manifest);
  await rename(manifestTmp, paths.manifest);

  return { paths, manifest, tariffLinesIndex };
}

export async function readCacheArtifacts(paths: ZaCustomsCachePaths): Promise<ZaCustomsCacheArtifacts | null> {
  if (!(await exists(paths.manifest))) return null;

  const manifest = parseManifest(await readFile(paths.manifest, "utf8"), paths.manifest);
  assertFileName(manifest.files.tariffLines, paths.tariffLines);
  assertFileName(manifest.files.tariffLinesIndex, paths.tariffLinesIndex);
  assertFileName(manifest.files.measures, paths.measures);

  await verifyFileRef(paths.tariffLines, manifest.files.tariffLines);
  await verifyFileRef(paths.tariffLinesIndex, manifest.files.tariffLinesIndex);
  await verifyFileRef(paths.measures, manifest.files.measures);

  const tariffLinesIndex = parseTariffLinesIndex(await readFile(paths.tariffLinesIndex, "utf8"), paths.tariffLinesIndex);
  if (tariffLinesIndex.rulesetId !== manifest.rulesetManifest.rulesetId) {
    throw new Error(`${paths.tariffLinesIndex} rulesetId does not match ${paths.manifest}.`);
  }
  return { paths, manifest, tariffLinesIndex };
}

export function readTariffLine(
  artifacts: ZaCustomsCacheArtifacts,
  tariffCode: string,
  effectiveDate = artifacts.manifest.resolvedEffectiveDate
): TariffLineV1 | null {
  const spans = spansForTariffCode(artifacts, tariffCode);
  const span = spans.find((candidate) => isSpanEffective(candidate, effectiveDate)) ?? spans[0];
  return span ? readTariffSpan(artifacts, span) : null;
}

export function readTariffLines(artifacts: ZaCustomsCacheArtifacts, tariffCode: string): TariffLineV1[] {
  return spansForTariffCode(artifacts, tariffCode).map((span) => readTariffSpan(artifacts, span));
}

export function listTariffLinesFromArtifacts(
  artifacts: ZaCustomsCacheArtifacts,
  filter: ZaCustomsTariffLineArtifactFilter = {}
): ZaCustomsTariffLineArtifactPage {
  const effectiveDate = filter.effectiveDate ?? artifacts.manifest.resolvedEffectiveDate;
  const limit = customsMeasureLimit(filter);
  const cursor = filter.cursor;
  const items: { cursor: string; line: TariffLineV1 }[] = [];

  for (const span of orderedTariffLineSpans(artifacts)) {
    const spanCursor = tariffLineCursor(span);
    if (cursor && spanCursor <= cursor) continue;
    if (!isSpanEffective(span, effectiveDate)) continue;
    items.push({ cursor: spanCursor, line: readTariffSpan(artifacts, span) });
    if (items.length >= limit + 1) break;
  }

  const page = items.slice(0, limit);
  return {
    items: page.map((item) => item.line),
    nextCursor: items.length > page.length ? page.at(-1)?.cursor ?? null : null
  };
}

export function listMeasuresFromArtifacts(
  artifacts: ZaCustomsCacheArtifacts,
  filter: ZaCustomsMeasureFilter = {}
): ZaCustomsMeasurePage {
  const limit = customsMeasureLimit(filter);
  const cursor = filter.cursor;
  const items = scanMeasures(artifacts, (measure) => {
    if (cursor && measure.id <= cursor) return null;
    if (!matchesCustomsMeasureFilter(measure, filter)) return null;
    return publicCustomsMeasure(measure, filter);
  }, limit + 1);
  const page = items.slice(0, limit);
  return {
    items: page,
    nextCursor: items.length > page.length ? page.at(-1)?.id ?? null : null
  };
}

function tmpPath(paths: ZaCustomsCachePaths, target: string): string {
  return join(paths.tmp, `${basename(target)}.${process.pid}.${Date.now().toString(36)}.${randomUUID()}.tmp`);
}

async function writeTariffLinesNdjson(path: string, container: CustomsRulesetContainerV1): Promise<TariffLinesIndexV1> {
  const byNormalizedTariffCode: Record<string, TariffLineSpanV1[]> = {};
  const handle = await openFile(path, "w");
  let offset = 0;
  let row = 0;

  try {
    for (const line of container.schedule1Part1.tariffLines) {
      const json = JSON.stringify(line);
      const length = Buffer.byteLength(json, "utf8");
      const span: TariffLineSpanV1 = {
        row,
        offset,
        length,
        tariffCode: line.tariffCode,
        normalizedTariffCode: line.normalizedTariffCode,
        validFrom: line.validFrom,
        validTo: line.validTo,
        recordSha256: sha256(json)
      };
      (byNormalizedTariffCode[line.normalizedTariffCode] ??= []).push(span);
      await handle.write(`${json}\n`, undefined, "utf8");
      offset += length + 1;
      row += 1;
    }
  } finally {
    await handle.close();
  }

  for (const spans of Object.values(byNormalizedTariffCode)) spans.sort(compareTariffLineSpans);
  return {
    schemaVersion: "za-customs.tariff-lines-index.v1",
    rulesetId: container.manifest.rulesetId,
    recordCount: row,
    byNormalizedTariffCode
  };
}

async function writeMeasuresNdjson(path: string, container: CustomsRulesetContainerV1): Promise<void> {
  const handle = await openFile(path, "w");
  try {
    for (const measure of allCustomsMeasures(container).sort((left, right) => left.id.localeCompare(right.id))) {
      await handle.write(`${JSON.stringify(measure)}\n`, undefined, "utf8");
    }
  } finally {
    await handle.close();
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fileRef(path: string): Promise<CacheFileRef> {
  const info = await stat(path);
  return {
    path: basename(path),
    bytes: info.size,
    sha256: await hashFileSha256(path)
  };
}

async function verifyFileRef(path: string, ref: CacheFileRef): Promise<void> {
  const info = await stat(path);
  if (info.size !== ref.bytes) throw new Error(`${path} byte length does not match ${ref.path}.`);
  const hash = await hashFileSha256(path);
  if (hash !== ref.sha256) throw new Error(`${path} sha256 does not match ${ref.path}.`);
}

function assertFileName(ref: CacheFileRef, expectedPath: string): void {
  if (ref.path !== basename(expectedPath)) throw new Error(`Cache manifest file ref ${ref.path} should be ${basename(expectedPath)}.`);
}

function parseManifest(json: string, path: string): ZaCustomsCacheManifestV1 {
  const value = JSON.parse(json) as Partial<ZaCustomsCacheManifestV1>;
  if (value.schemaVersion !== "za-customs.cache-manifest.v1" || value.encoding !== "utf8" || value.lineTerminator !== "\n") {
    throw new Error(`${path} is not a ZA customs cache manifest.`);
  }
  if (value.rulesetManifest?.schemaVersion !== "core.ruleset-manifest.v1" || !value.files || !value.resolvedEffectiveDate) {
    throw new Error(`${path} is missing required cache manifest fields.`);
  }
  return value as ZaCustomsCacheManifestV1;
}

function parseTariffLinesIndex(json: string, path: string): TariffLinesIndexV1 {
  const value = JSON.parse(json) as Partial<TariffLinesIndexV1>;
  if (value.schemaVersion !== "za-customs.tariff-lines-index.v1" || !value.byNormalizedTariffCode) {
    throw new Error(`${path} is not a ZA customs tariff line index.`);
  }
  return value as TariffLinesIndexV1;
}

function spansForTariffCode(artifacts: ZaCustomsCacheArtifacts, tariffCode: string): TariffLineSpanV1[] {
  return artifacts.tariffLinesIndex.byNormalizedTariffCode[normalize(tariffCode)] ?? [];
}

function orderedTariffLineSpans(artifacts: ZaCustomsCacheArtifacts): TariffLineSpanV1[] {
  return Object.values(artifacts.tariffLinesIndex.byNormalizedTariffCode)
    .flat()
    .sort((left, right) =>
      left.normalizedTariffCode.localeCompare(right.normalizedTariffCode) ||
      left.row - right.row
    );
}

function tariffLineCursor(span: TariffLineSpanV1): string {
  return `${span.normalizedTariffCode}:${String(span.row).padStart(10, "0")}`;
}

function readTariffSpan(artifacts: ZaCustomsCacheArtifacts, span: TariffLineSpanV1): TariffLineV1 {
  const buffer = Buffer.alloc(span.length);
  const fd = openSync(artifacts.paths.tariffLines, "r");
  try {
    const bytesRead = readSync(fd, buffer, 0, span.length, span.offset);
    if (bytesRead !== span.length) throw new Error(`Could not read tariff line row ${span.row} from ${artifacts.paths.tariffLines}.`);
  } finally {
    closeSync(fd);
  }

  if (sha256(buffer) !== span.recordSha256) {
    throw new Error(`Tariff line row ${span.row} in ${artifacts.paths.tariffLines} failed sha256 verification.`);
  }

  const line = JSON.parse(buffer.toString("utf8")) as TariffLineV1;
  if (
    line.normalizedTariffCode !== span.normalizedTariffCode ||
    line.validFrom !== span.validFrom ||
    (line.validTo ?? null) !== (span.validTo ?? null)
  ) {
    throw new Error(`Tariff line row ${span.row} in ${artifacts.paths.tariffLines} does not match its index span.`);
  }
  return line;
}

function scanMeasures<T>(
  artifacts: ZaCustomsCacheArtifacts,
  mapMeasure: (measure: InternalZaCustomsMeasure) => T | null,
  stopAfter: number
): T[] {
  const results: T[] = [];
  scanNdjson(artifacts.paths.measures, (line) => {
    const mapped = mapMeasure(JSON.parse(line) as InternalZaCustomsMeasure);
    if (mapped === null) return true;
    results.push(mapped);
    return results.length < stopAfter;
  });
  return results;
}

function scanNdjson(path: string, onLine: (line: string) => boolean): void {
  const fd = openSync(path, "r");
  const decoder = new StringDecoder("utf8");
  const buffer = Buffer.alloc(64 * 1024);
  let pending = "";

  try {
    for (;;) {
      const bytesRead = readSync(fd, buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      pending += decoder.write(buffer.subarray(0, bytesRead));
      let newline = pending.indexOf("\n");
      while (newline !== -1) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        if (line && !onLine(line)) return;
        newline = pending.indexOf("\n");
      }
    }
    pending += decoder.end();
    if (pending) onLine(pending);
  } finally {
    closeSync(fd);
  }
}

function compareTariffLineSpans(left: TariffLineSpanV1, right: TariffLineSpanV1): number {
  if (left.validFrom !== right.validFrom) {
    if (left.validFrom === "unknown") return 1;
    if (right.validFrom === "unknown") return -1;
    return right.validFrom.localeCompare(left.validFrom);
  }
  const leftOpen = !left.validTo;
  const rightOpen = !right.validTo;
  if (leftOpen !== rightOpen) return leftOpen ? -1 : 1;
  return left.tariffCode.localeCompare(right.tariffCode) || left.row - right.row;
}

function isSpanEffective(span: TariffLineSpanV1, effectiveDate: string): boolean {
  if (span.validFrom !== "unknown" && span.validFrom > effectiveDate) return false;
  if (span.validTo && span.validTo < effectiveDate) return false;
  return true;
}

function resolvedEffectiveDate(container: CustomsRulesetContainerV1): string {
  const manifestDate = container.manifest.effectiveDate;
  if (manifestDate && manifestDate !== "latest" && DATE_PATTERN.test(manifestDate)) return manifestDate;
  const latestLineDate = container.schedule1Part1.tariffLines
    .map((line) => line.validFrom)
    .filter((value) => DATE_PATTERN.test(value))
    .sort()
    .at(-1);
  if (latestLineDate) return latestLineDate;
  return container.manifest.generatedAt.slice(0, 10);
}

function scheduleSummaries(container: CustomsRulesetContainerV1): ZaCustomsCacheManifestV1["scheduleSummaries"] {
  return {
    schedule1Part1: { tariffLines: container.schedule1Part1.tariffLines.length },
    ...(container.schedule1ExciseLevies ? { schedule1ExciseLevies: { exciseLevyLines: container.schedule1ExciseLevies.exciseLevyLines.length } } : {}),
    ...(container.schedule2 ? { schedule2: { tradeRemedyLines: container.schedule2.tradeRemedyLines.length } } : {}),
    ...(container.schedule3 ? { schedule3: { rebateLines: container.schedule3.rebateLines.length } } : {}),
    ...(container.schedule4 ? { schedule4: { rebateLines: container.schedule4.rebateLines.length } } : {}),
    ...(container.schedule5 ? { schedule5: { drawbackRefundLines: container.schedule5.drawbackRefundLines.length } } : {}),
    ...(container.schedule6 ? { schedule6: { exciseRebateRefundLines: container.schedule6.exciseRebateRefundLines.length } } : {})
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function normalize(value: string): string {
  return value.replace(/\D/g, "");
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
