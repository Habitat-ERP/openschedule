# @openschedule/za-customs

South African customs duty lookups and estimates for TypeScript apps.

`@openschedule/za-customs` downloads official SARS customs schedule PDFs into your cache, builds indexed local cache artifacts, and lets your app look up tariff lines, rates, duty estimates, source references, duties, trade remedies, rebates, drawbacks, and refunds.

```bash
npm install @openschedule/za-customs
```

```ts
import { createZaCustoms } from "@openschedule/za-customs";

const customs = await createZaCustoms({ sync: "if-stale" });
const line = customs.lookup("000110", { includeMetadata: true });
const estimate = customs.estimate({
  tariffCode: "000110",
  customsValue: 1000,
  effectiveDate: "2026-07-05"
});
```

To enumerate current Schedule 1 tariff lines from an existing cache without syncing:

```ts
const customs = await createZaCustoms({ cacheDir, sync: "never" });

for (let cursor: string | undefined; ;) {
  const page = customs.tariffLines({ includeMetadata: true, limit: 500, cursor });
  for (const line of page.items) {
    console.log(line.normalizedTariffCode, line.displayName);
  }
  if (!page.nextCursor) break;
  cursor = page.nextCursor;
}
```

Sync modes are `never`, `if-missing`, `if-stale`, and `always`. Production apps should normally use `if-stale` in their own environment.

Live SARS parser smoke tests are opt-in and use local PDF paths, for example:

```bash
OPENSCHEDULE_SARS_PDF_PATH=/path/to/schedule-1-part-1.pdf npm test
```

Other env-gated parser tests follow the same `OPENSCHEDULE_SARS_*_PDF_PATH` pattern and are skipped when unset.

Why it works this way:

- **Runs locally after sync:** once the managed cache exists, lookups and estimates do not need internet access or a hosted tariff API.
- **Easy to audit:** `includeMetadata: true` and `source()` show parser warnings, SARS PDF page references, and document hashes.
- **Typed for app developers:** TypeScript types and JSON schemas describe tariff lines, rates, estimates, source references, and validation results.
- **Tested without copying SARS data:** `npm test` includes 50 synthetic duty examples covering ad valorem, specific, compound, preferential/free, and unresolved fallback cases.
- **Flags incomplete parses:** validation warns when a parse produced too few lines, reported parser warnings, or has mismatched counts.

```mermaid
flowchart LR
  sars["Official SARS schedule PDFs"] --> sync["Your app downloads supported sources"]
  sync --> cache["Your local cache<br/>PDFs + download metadata"]
  cache --> build["OpenSchedule builds<br/>indexed cache artifacts"]
  build --> runtime["Your app reads<br/>the local cache"]
  runtime --> output["Lookup and estimate results"]
  runtime --> audit["Optional audit details<br/>PDF page + SHA-256 + warnings"]

  cache -. "OpenSchedule does not publish SARS PDFs or datasets" .-> build
  runtime -. "No hosted API needed after sync" .-> output
  audit -. "Check result against SARS source" .-> output
```

OpenSchedule does not ship SARS PDFs, SARS datasets, or a prebuilt customs database. Examples use synthetic tariff codes to avoid copying official SARS tariff content.

OpenSchedule is not a customs broker, classification engine, legal opinion, or hosted tariff API. Verify legal reliance against official SARS sources.
