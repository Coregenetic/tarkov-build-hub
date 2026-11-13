---
name: tarkov-data-integrations
description: Research, import, normalize, cache, and version Escape from Tarkov item, weapon, attachment, trader, and patch data for the build-sharing platform.
---

# Tarkov Data Integrations

## Source discipline
- First identify reliable, permitted data sources and their terms, rate limits, attribution requirements, and update cadence.
- Prefer documented APIs or explicitly permitted datasets over scraping.
- Do not bypass access controls, CAPTCHAs, authentication, or technical restrictions.
- Never assume a third-party API is official. Label community-maintained sources accurately.
- If no trustworthy source exists for a field, show "not available" rather than inventing a value.

## Normalization
Normalize items into stable internal records:
- internalId, externalId, name, normalizedName, itemType, image reference, caliber, slots, compatible parent/child relationships, stats, trader availability, price, source, sourceUpdatedAt, gameVersion.
- Keep raw source payloads separately for debugging and re-import.
- Build an adapter layer so providers can be swapped without rewriting the app.
- Cache external requests and use scheduled refreshes where permitted.
- Record data freshness and surface stale-data warnings in admin tools.

## Patch handling
- Version datasets by game patch.
- Never silently mutate the meaning of an already-published build.
- Provide migration/revalidation reports when compatibility changes.
- Include an admin import preview, validation report, and rollback path.
