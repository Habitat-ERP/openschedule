import { constants } from "node:fs";
import { access, mkdir, readFile, readdir, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { RulesetManifestV1, SourceDocumentMetadataV1, SourceTraceV1, ValidationReportV1 } from "@openschedule/core";
import { hashFileSha256 } from "@openschedule/core";
import {
  checkCustomsSources,
  discoverCustomsSources,
  fetchCustomsSources,
  type FetchedCustomsSourceV1,
  type SarsCustomsSourceV1
} from "@openschedule/za-sars";
import PackageJson from "../package.json" with { type: "json" };
import {
  listMeasuresFromArtifacts,
  readCacheArtifacts,
  readTariffLine,
  readTariffLines,
  writeCacheArtifacts,
  zaCustomsCachePaths,
  type ZaCustomsCacheArtifacts,
  type ZaCustomsCachePaths
} from "./cache-artifacts.js";
import { estimateCustomsDuty, listRateOptions } from "./estimator.js";
import {
  buildCustomsRulesetContainer,
  formatTariffLineDisplayName,
  validateCustomsRulesetContainer
} from "./rulesets.js";
import { parseSchedule1ExciseLeviesPdf } from "./schedule1-excise-levies-parser.js";
import { parseSchedule1Part1Pdf } from "./schedule1-parser.js";
import { parseSchedule2TradeRemediesPdf } from "./schedule2-parser.js";
import { parseSchedule3IndustrialRebatesPdf } from "./schedule3-parser.js";
import { parseSchedule4RebatesPdf } from "./schedule4-parser.js";
import { parseSchedule5DrawbacksRefundsPdf } from "./schedule5-parser.js";
import { parseSchedule6ExciseRebatesRefundsPdf } from "./schedule6-parser.js";
import type {
  CustomsDutyEstimateV1,
  CustomsRateColumnV1,
  CustomsRateOptionV1,
  CustomsRulesetContainerV1,
  CustomsRulesetV1,
  DutyRateV1,
  EstimateCustomsDutyOptionsV1,
  Schedule1ExciseLeviesParseResultV1,
  TariffLineV1
} from "./types.js";
import type {
  ZaCustomsDutyRate,
  ZaCustomsMetadataOptions,
  ZaCustomsMeasureFilter,
  ZaCustomsMeasurePage,
  ZaCustomsRateTable
} from "./measures.js";

export type ZaCustomsSyncMode = "never" | "if-missing" | "if-stale" | "always";
export type ZaCustomsEffectiveDate = "latest" | string;

export interface CreateZaCustomsOptions {
  cacheDir?: string;
  sync?: ZaCustomsSyncMode;
  effectiveDate?: ZaCustomsEffectiveDate;
  fetch?: typeof fetch;
  logger?: (event: ZaCustomsEvent) => void;
}

export interface ZaCustomsEvent {
  level: "info" | "warn";
  code: string;
  message: string;
}

export interface ZaCustomsSyncResult {
  rulesetId: string;
  cacheDir: string;
  manifestPath: string;
  fetched: string[];
  warnings: string[];
  validation: ValidationReportV1;
}

export interface ZaCustomsTariffLineMetadata {
  sourceTrace: SourceTraceV1[];
  sourceDocuments: SourceDocumentMetadataV1[];
  confidence: number;
  warnings: string[];
}

export interface ZaCustomsTariffLine {
  tariffCode: string;
  normalizedTariffCode: string;
  description: string;
  displayName: string;
  statisticalUnit?: string | null;
  rates: ZaCustomsRateTable;
  validFrom: string;
  validTo?: string | null;
  metadata?: ZaCustomsTariffLineMetadata;
}

export interface ZaCustomsSourceReference {
  trace: SourceTraceV1;
  document: SourceDocumentMetadataV1 | null;
}

export interface ZaCustomsRateOptionMetadata {
  warnings: string[];
  sourceTrace: SourceTraceV1[];
}

export interface ZaCustomsRateOption {
  column: CustomsRateColumnV1;
  raw: string;
  kind: ZaCustomsDutyRate["kind"];
  metadata?: ZaCustomsRateOptionMetadata;
}

export interface ZaCustomsDutyEstimateMetadata {
  sourceTrace: SourceTraceV1[];
  warnings: string[];
}

export interface ZaCustomsDutyEstimate {
  estimatedDuty: number | null;
  currency: "ZAR";
  rulesetId: string;
  tariffCode: string;
  rateColumn: string;
  effectiveDate: string;
  metadata?: ZaCustomsDutyEstimateMetadata;
}

export interface ZaCustomsEstimateOptions
  extends Omit<EstimateCustomsDutyOptionsV1, "ruleset" | "effectiveDate">,
    ZaCustomsMetadataOptions {
  effectiveDate?: string;
}

export interface ZaCustoms {
  readonly rulesetId: string;
  sync(options?: { mode?: ZaCustomsSyncMode; effectiveDate?: ZaCustomsEffectiveDate }): Promise<ZaCustomsSyncResult>;
  lookup(tariffCode: string, options?: ZaCustomsMetadataOptions): ZaCustomsTariffLine | null;
  rates(tariffCode: string, options?: ZaCustomsMetadataOptions): ZaCustomsRateOption[];
  estimate(options: ZaCustomsEstimateOptions): ZaCustomsDutyEstimate;
  source(tariffCode: string): ZaCustomsSourceReference[];
  measures(filter?: ZaCustomsMeasureFilter): ZaCustomsMeasurePage;
  duties(filter?: Omit<ZaCustomsMeasureFilter, "kind">): ZaCustomsMeasurePage;
  reliefs(filter?: Omit<ZaCustomsMeasureFilter, "kind">): ZaCustomsMeasurePage;
}

type CachePaths = ZaCustomsCachePaths;

interface LocalSource {
  document: SourceDocumentMetadataV1;
  documentPath: string;
  metadataPath: string;
  source: SarsCustomsSourceV1 | null;
}

interface SyncCacheResult {
  artifacts: ZaCustomsCacheArtifacts;
  fetched: string[];
  warnings: string[];
  validation: ValidationReportV1;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function createZaCustoms(options: CreateZaCustomsOptions = {}): Promise<ZaCustoms> {
  const paths = cachePaths(options.cacheDir);
  const effectiveDate = options.effectiveDate ?? "latest";
  const mode = options.sync ?? "if-missing";
  const runtime = { ...options, effectiveDate };

  await mkdir(paths.sources, { recursive: true });
  await mkdir(paths.tmp, { recursive: true });

  let artifacts = await readCacheArtifacts(paths);
  if (!artifacts && mode === "never" && await exists(paths.legacyContainer)) {
    throw new Error(`${paths.legacyContainer} is an old ZA customs cache. Run createZaCustoms({ sync: "always" }) or openschedule customs sync to rebuild indexed artifacts.`);
  }
  let initialSyncResult: ZaCustomsSyncResult | undefined;
  if (mode === "always" || mode === "if-stale" || !artifacts) {
    const result = await syncCache(paths, mode, runtime);
    artifacts = result.artifacts;
    initialSyncResult = syncResult(paths, result);
  }

  return new CachedZaCustoms(paths, runtime, artifacts, initialSyncResult);
}

class CachedZaCustoms implements ZaCustoms {
  constructor(
    private readonly paths: CachePaths,
    private readonly options: CreateZaCustomsOptions & { effectiveDate: ZaCustomsEffectiveDate },
    private artifacts: ZaCustomsCacheArtifacts,
    private initialSyncResult?: ZaCustomsSyncResult
  ) {}

  get rulesetId(): string {
    return this.artifacts.manifest.rulesetManifest.rulesetId;
  }

  async sync(options: { mode?: ZaCustomsSyncMode; effectiveDate?: ZaCustomsEffectiveDate } = {}): Promise<ZaCustomsSyncResult> {
    const mode = options.mode ?? "always";
    if (mode === "never") {
      if (this.initialSyncResult) {
        const result = this.initialSyncResult;
        this.initialSyncResult = undefined;
        return result;
      }
      return {
        rulesetId: this.rulesetId,
        cacheDir: this.paths.root,
        manifestPath: this.paths.manifest,
        fetched: [],
        warnings: this.artifacts.manifest.rulesetManifest.warnings,
        validation: validCacheReport()
      };
    }

    const result = await syncCache(this.paths, mode, {
      ...this.options,
      effectiveDate: options.effectiveDate ?? this.options.effectiveDate
    });
    this.artifacts = result.artifacts;
    this.initialSyncResult = undefined;
    return syncResult(this.paths, result);
  }

  lookup(tariffCode: string, options: ZaCustomsMetadataOptions = {}): ZaCustomsTariffLine | null {
    const line = readTariffLine(this.artifacts, tariffCode, defaultEffectiveDate(this.options.effectiveDate, this.artifacts));
    return line ? consumerLine(line, this.artifacts.manifest.rulesetManifest, options) : null;
  }

  rates(tariffCode: string, options: ZaCustomsMetadataOptions = {}): ZaCustomsRateOption[] {
    const line = readTariffLine(this.artifacts, tariffCode, defaultEffectiveDate(this.options.effectiveDate, this.artifacts));
    if (!line) return [];
    return listRateOptions(artifactAsSchedule1Ruleset(this.artifacts, [line]), tariffCode).map((rate) => consumerRateOption(rate, options));
  }

  estimate(options: ZaCustomsEstimateOptions): ZaCustomsDutyEstimate {
    const { includeMetadata, ...estimateOptions } = options;
    return consumerEstimate(estimateCustomsDuty({
      ...estimateOptions,
      ruleset: artifactAsSchedule1Ruleset(this.artifacts, readTariffLines(this.artifacts, estimateOptions.tariffCode)),
      effectiveDate: estimateOptions.effectiveDate ?? defaultEffectiveDate(this.options.effectiveDate, this.artifacts)
    }), { includeMetadata });
  }

  source(tariffCode: string): ZaCustomsSourceReference[] {
    const line = readTariffLine(this.artifacts, tariffCode, defaultEffectiveDate(this.options.effectiveDate, this.artifacts));
    return line?.sourceTrace.map((trace) => ({
      trace,
      document: this.artifacts.manifest.rulesetManifest.sourceDocuments.find((document) => document.sha256 === trace.sourceDocumentSha256) ?? null
    })) ?? [];
  }

  measures(filter: ZaCustomsMeasureFilter = {}): ZaCustomsMeasurePage {
    return listMeasuresFromArtifacts(this.artifacts, filter);
  }

  duties(filter: Omit<ZaCustomsMeasureFilter, "kind"> = {}): ZaCustomsMeasurePage {
    return listMeasuresFromArtifacts(this.artifacts, {
      ...filter,
      kind: ["ordinary-duty", "excise-levy", "trade-remedy"]
    });
  }

  reliefs(filter: Omit<ZaCustomsMeasureFilter, "kind"> = {}): ZaCustomsMeasurePage {
    return listMeasuresFromArtifacts(this.artifacts, {
      ...filter,
      kind: ["rebate", "drawback", "refund", "drawback-or-refund"]
    });
  }
}

async function syncCache(
  paths: CachePaths,
  mode: ZaCustomsSyncMode,
  options: CreateZaCustomsOptions & { effectiveDate: ZaCustomsEffectiveDate }
): Promise<SyncCacheResult> {
  const sources = discoverCustomsSources().filter((source) => source.sourceFormat === "application/pdf");
  const staleSources = await sourcesToFetch(paths, sources, mode, options.fetch);
  if (staleSources.length) emit(options, "info", "sources_fetch", `Fetching ${staleSources.length} SARS customs source document(s).`);
  const fetched = staleSources.length ? await fetchAndPromote(paths, staleSources, options.fetch) : [];
  emit(options, "info", "ruleset_build", "Building ZA customs data from cached source documents.");
  const container = await buildFromCache(paths, options);
  const validation = validateCustomsRulesetContainer(container);
  if (!validation.valid) {
    throw new Error(`ZA customs cache built an invalid ruleset: ${validation.issues.map((issue) => issue.code).join(", ")}`);
  }
  const artifacts = await writeCacheArtifacts(paths, container);
  return {
    artifacts,
    fetched: fetched.map((source) => source.source.id),
    warnings: container.manifest.warnings,
    validation
  };
}

function syncResult(paths: CachePaths, result: SyncCacheResult): ZaCustomsSyncResult {
  return {
    rulesetId: result.artifacts.manifest.rulesetManifest.rulesetId,
    cacheDir: paths.root,
    manifestPath: paths.manifest,
    fetched: result.fetched,
    warnings: result.warnings,
    validation: result.validation
  };
}

async function sourcesToFetch(
  paths: CachePaths,
  sources: readonly SarsCustomsSourceV1[],
  mode: ZaCustomsSyncMode,
  fetcher?: typeof fetch
): Promise<SarsCustomsSourceV1[]> {
  if (mode === "never") return [];
  if (mode === "always") return [...sources];

  const locals = await readLocalSources(paths.sources);
  const missing = sources.filter((source) => !locals.some((local) => localMatchesSource(local, source)));
  if (mode === "if-missing") return missing;

  const statuses = await checkCustomsSources({ sources, cacheDir: paths.sources, fetch: fetcher });
  return statuses
    .filter((status) => status.status === "missing" || status.status === "changed")
    .map((status) => status.source);
}

async function fetchAndPromote(
  paths: CachePaths,
  sources: readonly SarsCustomsSourceV1[],
  fetcher?: typeof fetch
): Promise<FetchedCustomsSourceV1[]> {
  const outDir = join(paths.tmp, `fetch-${Date.now().toString(36)}`);
  await mkdir(outDir, { recursive: true });
  const fetched = await fetchCustomsSources({ outDir, sources, fetch: fetcher });

  for (const item of fetched) {
    await removeCachedSource(paths.sources, item.source.id);
    const documentPath = join(paths.sources, basename(item.documentPath));
    const metadataPath = join(paths.sources, basename(item.metadataPath));
    await rename(item.documentPath, documentPath);
    await rename(item.metadataPath, metadataPath);
    item.documentPath = documentPath;
    item.metadataPath = metadataPath;
  }

  await rm(outDir, { recursive: true, force: true });
  return fetched;
}

async function buildFromCache(
  paths: CachePaths,
  options: CreateZaCustomsOptions & { effectiveDate: ZaCustomsEffectiveDate }
): Promise<CustomsRulesetContainerV1> {
  const locals = await readLocalSources(paths.sources);
  const bySourceId = new Map(locals.flatMap((local) => {
    const id = local.source?.id ?? local.document.sourceIdentifier;
    return id ? [[id, local]] : [];
  }));
  const warnings: string[] = [];

  const part1 = sourceById(bySourceId, "ZA_SARS_CUSTOMS_SCHEDULE_1_PART_1", paths.sources);
  const sourceDocuments = await verifiedSourceDocuments(locals);
  const schedule1Part1 = await parseSchedule1Part1Pdf({ pdfPath: part1.documentPath });

  const exciseSources = localsForFamily(locals, "schedule-1-excise-levies");
  const schedule1ExciseLevies = exciseSources.length ? await parseExciseLevies(exciseSources, warnings) : undefined;
  const schedule2 = await parseOptional(bySourceId.get("ZA_SARS_CUSTOMS_SCHEDULE_2"), parseSchedule2TradeRemediesPdf);
  const schedule3 = await parseOptional(bySourceId.get("ZA_SARS_CUSTOMS_SCHEDULE_3"), parseSchedule3IndustrialRebatesPdf);
  const schedule4 = await parseOptional(bySourceId.get("ZA_SARS_CUSTOMS_SCHEDULE_4"), parseSchedule4RebatesPdf);
  const schedule5 = await parseOptional(bySourceId.get("ZA_SARS_CUSTOMS_SCHEDULE_5"), parseSchedule5DrawbacksRefundsPdf);
  const schedule6 = await parseOptional(bySourceId.get("ZA_SARS_CUSTOMS_SCHEDULE_6"), parseSchedule6ExciseRebatesRefundsPdf);

  return buildCustomsRulesetContainer({
    manifest: {
      schemaVersion: "core.ruleset-manifest.v1",
      rulesetId: "",
      domain: "za-customs",
      country: "ZA",
      publisher: "SARS",
      generatedAt: new Date().toISOString(),
      effectiveDate: options.effectiveDate === "latest" ? "latest" : dateOption(options.effectiveDate),
      sourceDocuments,
      parser: {
        packageName: PackageJson.name,
        packageVersion: PackageJson.version
      },
      warnings
    },
    schedule1Part1,
    schedule1ExciseLevies,
    schedule2,
    schedule3,
    schedule4,
    schedule5,
    schedule6
  });
}

async function parseOptional<T>(local: LocalSource | undefined, parser: (options: { pdfPath: string }) => Promise<T>): Promise<T | undefined> {
  return local ? parser({ pdfPath: local.documentPath }) : undefined;
}

async function parseExciseLevies(locals: readonly LocalSource[], warnings: string[]): Promise<Schedule1ExciseLeviesParseResultV1> {
  const results = await Promise.all(locals.map((local) => parseSchedule1ExciseLeviesPdf({ pdfPath: local.documentPath })));
  const metrics = {
    pagesParsed: 0,
    textItems: 0,
    layoutRows: 0,
    candidateRows: 0,
    contextRows: 0,
    exciseLevyLines: 0,
    rejectedRows: 0
  };

  for (const result of results) {
    metrics.pagesParsed += result.metrics.pagesParsed;
    metrics.textItems += result.metrics.textItems;
    metrics.layoutRows += result.metrics.layoutRows;
    metrics.candidateRows += result.metrics.candidateRows;
    metrics.contextRows += result.metrics.contextRows;
    metrics.exciseLevyLines += result.metrics.exciseLevyLines;
    metrics.rejectedRows += result.metrics.rejectedRows;
    warnings.push(...result.warnings);
  }

  return {
    schemaVersion: "za-customs.schedule1-excise-levies-parse-result.v1",
    exciseLevyLines: results
      .flatMap((result) => result.exciseLevyLines)
      .sort((left, right) =>
        left.part.localeCompare(right.part) ||
        left.normalizedItem.localeCompare(right.normalizedItem) ||
        left.normalizedTariffSubheading.localeCompare(right.normalizedTariffSubheading)
      ),
    warnings: results.flatMap((result) => result.warnings),
    metrics,
    pageMetrics: results.flatMap((result) => result.pageMetrics ?? [])
  };
}

async function verifiedSourceDocuments(locals: readonly LocalSource[]): Promise<SourceDocumentMetadataV1[]> {
  const documents: SourceDocumentMetadataV1[] = [];
  for (const local of locals) {
    const sha256 = await hashFileSha256(local.documentPath);
    if (sha256 !== local.document.sha256) {
      throw new Error(`${local.documentPath} does not match its source metadata sha256.`);
    }
    documents.push(local.document);
  }
  return documents;
}

function sourceById(sources: ReadonlyMap<string, LocalSource>, id: string, sourceDir: string): LocalSource {
  const source = sources.get(id);
  if (!source) throw new Error(`Missing required SARS source ${id} in ${sourceDir}. Run createZaCustoms({ sync: "if-missing" }) or customs.sync().`);
  return source;
}

function localsForFamily(locals: readonly LocalSource[], family: SarsCustomsSourceV1["family"]): LocalSource[] {
  return locals
    .filter((local) => local.source?.family === family)
    .sort((left, right) => (left.source?.id ?? "").localeCompare(right.source?.id ?? ""));
}

async function readLocalSources(sourceDir: string): Promise<LocalSource[]> {
  const entries = await readdir(sourceDir).catch(() => []);
  const sources = discoverCustomsSources();
  const locals: LocalSource[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(".metadata.json")) continue;
    const metadataPath = join(sourceDir, entry);
    const document = parseSourceDocumentMetadata(await readFile(metadataPath, "utf8"), metadataPath);
    const documentPath = join(sourceDir, document.fileName ?? entry.slice(0, -".metadata.json".length));
    locals.push({
      document,
      documentPath,
      metadataPath,
      source: sources.find((source) => localMatchesSource({ document, documentPath, metadataPath, source: null }, source)) ?? null
    });
  }

  return locals;
}

function parseSourceDocumentMetadata(json: string, path: string): SourceDocumentMetadataV1 {
  const value = JSON.parse(json) as Partial<SourceDocumentMetadataV1>;
  if (value.schemaVersion !== "core.source-document-metadata.v1" || typeof value.sha256 !== "string") {
    throw new Error(`${path} is not source document metadata.`);
  }
  return value as SourceDocumentMetadataV1;
}

function localMatchesSource(local: LocalSource, source: SarsCustomsSourceV1): boolean {
  if (local.source?.id === source.id) return true;
  if (local.document.sourceIdentifier === source.id) return true;
  if (local.document.sourceUrl === source.sourceUrl) return true;
  return Boolean(local.document.fileName?.startsWith(`${source.id}_`));
}

async function removeCachedSource(sourceDir: string, sourceId: string): Promise<void> {
  await mkdir(sourceDir, { recursive: true });
  for (const entry of await readdir(sourceDir)) {
    if (entry.startsWith(`${sourceId}_`)) await rm(join(sourceDir, entry), { force: true });
  }
}

function cachePaths(cacheDir: string | undefined): CachePaths {
  return zaCustomsCachePaths(cacheDir ?? defaultCacheDir());
}

function defaultCacheDir(): string {
  const base =
    process.env.OPENSCHEDULE_CACHE_DIR ??
    (process.platform === "win32"
      ? process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local")
      : process.platform === "darwin"
        ? join(homedir(), "Library", "Caches")
        : process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"));
  return join(base, "openschedule", "za-customs");
}

function artifactAsSchedule1Ruleset(artifacts: ZaCustomsCacheArtifacts, tariffLines: TariffLineV1[]): CustomsRulesetV1 {
  return {
    schemaVersion: "za-customs.customs-ruleset.v1",
    manifest: artifacts.manifest.rulesetManifest,
    parseMetrics: {
      pagesParsed: 0,
      textItems: 0,
      layoutRows: 0,
      candidateRows: tariffLines.length,
      contextRows: 0,
      tariffLines: tariffLines.length,
      rejectedRows: 0
    },
    tariffLines
  };
}

function consumerLine(
  line: TariffLineV1,
  manifest: RulesetManifestV1,
  options: ZaCustomsMetadataOptions
): ZaCustomsTariffLine {
  return {
    tariffCode: line.tariffCode,
    normalizedTariffCode: line.normalizedTariffCode,
    description: line.normalizedDescription || line.description,
    displayName: formatTariffLineDisplayName(line),
    statisticalUnit: line.statisticalUnit,
    rates: consumerRates(line.rates, options),
    validFrom: line.validFrom,
    validTo: line.validTo,
    ...(options.includeMetadata
      ? {
          metadata: {
            sourceTrace: line.sourceTrace,
            sourceDocuments: sourceDocumentsForTrace(line.sourceTrace, manifest),
            confidence: line.parseConfidence,
            warnings: line.warnings
          }
        }
      : {})
  };
}

function consumerRates(rates: TariffLineV1["rates"], options: ZaCustomsMetadataOptions): ZaCustomsRateTable {
  return {
    general: consumerDutyRate(rates.general, options),
    ...(rates.euUk ? { euUk: consumerDutyRate(rates.euUk, options) } : {}),
    ...(rates.efta ? { efta: consumerDutyRate(rates.efta, options) } : {}),
    ...(rates.sadc ? { sadc: consumerDutyRate(rates.sadc, options) } : {}),
    ...(rates.mercosur ? { mercosur: consumerDutyRate(rates.mercosur, options) } : {}),
    ...(rates.afcfta ? { afcfta: consumerDutyRate(rates.afcfta, options) } : {})
  };
}

function consumerDutyRate(rate: DutyRateV1, options: ZaCustomsMetadataOptions): ZaCustomsDutyRate {
  return {
    raw: rate.raw,
    kind: rate.kind,
    components: rate.components,
    ...(options.includeMetadata ? { metadata: { warnings: rate.warnings } } : {})
  };
}

function consumerRateOption(option: CustomsRateOptionV1, options: ZaCustomsMetadataOptions): ZaCustomsRateOption {
  return {
    column: option.column,
    raw: option.raw,
    kind: option.kind,
    ...(options.includeMetadata
      ? { metadata: { warnings: option.warnings, sourceTrace: option.sourceTrace } }
      : {})
  };
}

function consumerEstimate(estimate: CustomsDutyEstimateV1, options: ZaCustomsMetadataOptions): ZaCustomsDutyEstimate {
  return {
    estimatedDuty: estimate.estimatedDuty,
    currency: estimate.currency,
    rulesetId: estimate.rulesetId,
    tariffCode: estimate.tariffCode,
    rateColumn: estimate.rateColumn,
    effectiveDate: estimate.effectiveDate,
    ...(options.includeMetadata
      ? { metadata: { sourceTrace: estimate.sourceTrace, warnings: estimate.warnings } }
      : {})
  };
}

function sourceDocumentsForTrace(
  trace: readonly SourceTraceV1[],
  manifest: RulesetManifestV1
): SourceDocumentMetadataV1[] {
  const hashes = new Set(trace.map((item) => item.sourceDocumentSha256));
  return manifest.sourceDocuments.filter((document) => hashes.has(document.sha256));
}

function defaultEffectiveDate(value: ZaCustomsEffectiveDate, artifacts: ZaCustomsCacheArtifacts): string {
  if (value !== "latest") return dateOption(value);
  return artifacts.manifest.resolvedEffectiveDate;
}

function dateOption(value: string): string {
  if (!DATE_PATTERN.test(value)) throw new Error("effectiveDate must be YYYY-MM-DD or latest.");
  return value;
}

function emit(
  options: Pick<CreateZaCustomsOptions, "logger">,
  level: ZaCustomsEvent["level"],
  code: string,
  message: string
): void {
  options.logger?.({ level, code, message });
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function validCacheReport(): ValidationReportV1 {
  return {
    schemaVersion: "core.validation-report.v1",
    valid: true,
    issues: []
  };
}
