# @openschedule/za-sars

SARS customs source discovery, status checks, and fetch helpers for OpenSchedule.

This package declares supported official SARS customs source descriptors, fetches supported PDF sources into a local cache, writes source metadata, and checks local cached sources against current official source bytes where supported.

```bash
npm install @openschedule/za-sars
```

```ts
import { checkCustomsSources, discoverCustomsSources } from "@openschedule/za-sars";

const sources = discoverCustomsSources();
const status = await checkCustomsSources({ cacheDir: "/path/to/cache/sources" });
```

HTML tariff amendment registries are declared for visibility and manual review. Notice-level parsing is not implemented yet.

OpenSchedule does not publish or bundle SARS PDFs, SARS datasets, or shared generated customs rulesets. Consumers are responsible for their own source rights, cache contents, and legal reliance checks.
