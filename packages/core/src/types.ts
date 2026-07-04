export interface SourceDocumentMetadataV1 {
  schemaVersion: "core.source-document-metadata.v1";
  sha256: string;
  fileName?: string | null;
  sourceUrl?: string | null;
  retrievedAt?: string | null;
}

export interface SourceTraceV1 {
  schemaVersion: "core.source-trace.v1";
  sourceDocumentSha256: string;
  page?: number | null;
  locator?: string | null;
  text?: string | null;
}

export interface RulesetManifestV1 {
  schemaVersion: "core.ruleset-manifest.v1";
  rulesetId: string;
  domain: string;
  country: string;
  publisher: string;
  generatedAt: string;
  effectiveDate?: string | null;
  sourceDocuments: SourceDocumentMetadataV1[];
  parser: {
    packageName: string;
    packageVersion: string;
  };
  warnings: string[];
}

export type ValidationSeverityV1 = "error" | "warning";

export interface ValidationIssueV1 {
  schemaVersion: "core.validation-issue.v1";
  severity: ValidationSeverityV1;
  code: string;
  message: string;
  path?: string | null;
}

export interface ValidationReportV1 {
  schemaVersion: "core.validation-report.v1";
  valid: boolean;
  issues: ValidationIssueV1[];
}

export interface RulesetDiffChangeV1 {
  schemaVersion: "core.ruleset-diff-change.v1";
  category: string;
  path?: string | null;
  key?: string | null;
  label?: string | null;
  before?: unknown;
  after?: unknown;
  sourceTrace?: SourceTraceV1[];
}

export interface RulesetDiffV1 {
  schemaVersion: "core.ruleset-diff.v1";
  beforeRulesetId?: string | null;
  afterRulesetId?: string | null;
  changes: RulesetDiffChangeV1[];
}
