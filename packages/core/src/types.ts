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
