# @openschedule/za-customs

Consumer API and ruleset tooling for South African customs schedules.

`@openschedule/za-customs` fetches supported official SARS customs schedule PDFs into the consumer's local cache, builds a local `za-customs.json` ruleset, and exposes tariff lookup, rate options, mechanical duty estimates, source trace, duties, trade remedies, rebates, drawbacks, and refunds.

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

Sync modes are `never`, `if-missing`, `if-stale`, and `always`. Production consumers should normally use `if-stale` in their own environment.

OpenSchedule does not publish or bundle SARS PDFs, SARS datasets, or shared generated customs rulesets. Examples use synthetic tariff codes to avoid copying official SARS tariff content.

OpenSchedule is not a customs broker, classification engine, legal opinion, or hosted tariff API. Verify legal reliance against official SARS sources.
