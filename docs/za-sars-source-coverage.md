# SARS Customs Source Coverage

Phase 9 registers official SARS customs and tariff source families. It does not
parse new families, apply amendment notices, classify goods, or publish any SARS
documents or SARS-derived datasets.

Verified against SARS public pages on 2026-07-04:

- Schedules to the Customs and Excise Act, 1964:
  https://www.sars.gov.za/legal-counsel/primary-legislation/schedules-to-the-customs-and-excise-act-1964/
- Tariff amendments:
  https://www.sars.gov.za/legal-counsel/secondary-legislation/tariff-amendments/
- Tariff amendments 2026:
  https://www.sars.gov.za/legal-counsel/secondary-legislation/tariff-amendments/tariff-amendments-2026/

## Covered Families

- `schedule-1-customs`: Schedule 1 general notes and Part 1 ordinary customs duty.
- `schedule-1-excise-levies`: Schedule 1 excise, ad valorem, environmental, fuel, road accident fund, export,
  health promotion, sugary beverage, and ordinary levy parts listed by SARS.
- `schedule-2-trade-remedies`: Schedule 2 anti-dumping, countervailing, and safeguard duties.
- `rebates-drawbacks-refunds`: Schedules 3, 4, 5, and 6 rebate, drawback, and refund sources.
- `amendment-notices`: SARS tariff amendment registry pages, including the current 2026 notice page.

## Exclusions

- Schedule 8 licences and Schedule 10 trade agreement text are not registered in Phase 9 because the roadmap
  scope is tariff/rate source discovery, trade remedies, rebates/refunds, excise/levies, and amendment notice
  registries.
- Individual amendment notices are not enumerated yet. Phase 13 is the place for notice-level metadata.
- Parsers now exist for Schedule 2 trade remedies, Schedule 3 industrial rebates, Schedule 4 rebates,
  Schedule 5 drawbacks/refunds, Schedule 6 excise rebates/refunds, Schedule 1 Part 2A specific excise
  duties, and Schedule 1 Part 2B ad valorem excise duties. No parser exists for the remaining Schedule 1
  excise/levy parts or amendment notices.
- `fetchCustomsSources()` fetches PDF descriptors only. HTML amendment registry pages are discovery metadata until a later update-detection or notice-discovery phase.
