# @openschedule/cli

Command-line tools for OpenSchedule statutory rulesets.

```bash
npm install -g @openschedule/cli
```

Consumer ZA customs commands:

```bash
openschedule customs sync --sync if-stale
openschedule customs lookup --tariff-code 000110 --include-metadata
openschedule customs rates --tariff-code 000110
openschedule customs estimate --tariff-code 000110 --customs-value 1000
openschedule customs source --tariff-code 000110
openschedule customs measures --tariff-prefix 0307
```

Source freshness checks:

```bash
openschedule status za-sars customs --cache <cache>
```

OpenSchedule builds from official SARS sources fetched into the user's local cache. It does not publish or bundle SARS PDFs, SARS datasets, or shared generated customs rulesets.
