---
name: tarkov-build-platform
description: Build and maintain a polished community platform for sharing, browsing, rating, saving, and comparing Escape from Tarkov weapon builds. Use when planning features, architecture, data models, or implementing end-to-end product flows.
---

# Tarkov Build Platform

Build a production-minded community website for Escape from Tarkov weapon builds. The product is a build-sharing platform, not merely a static gallery.

## Product principles
- Make the build itself the star: weapon, parts, compatibility, stats, cost, creator, patch/version, and a clear visual hierarchy.
- Prioritize fast browsing, excellent search/filtering, mobile usability, accessibility, and trustworthy data.
- Never fabricate Tarkov item stats, prices, compatibility, recoil values, or patch information. Mark unknown data as unknown and isolate data sources behind adapters.
- Keep game data, user-generated content, and computed build statistics separate.
- Design for future game patches and schema migrations from day one.

## Core journeys
1. Visitor discovers builds, filters by weapon/platform/caliber/role/budget/author/popularity, and opens a detailed build page.
2. Signed-in user creates a build in a guided builder, adds compatible parts, writes notes, selects a use case, previews the result, and publishes or saves as draft.
3. Community members like, bookmark, comment on, report, and optionally fork/remix a build.
4. Creator edits, versions, unpublishes, or deletes their own builds.
5. Moderators review reports and manage abusive content.

## Required build data
At minimum model:
- Build: id, slug, title, description, creatorId, weaponTemplateId, slot/part selections, intended role, budget tier, tags, visibility, status, createdAt, updatedAt, gameVersion, buildVersion.
- Part selection: item/template id, slot id, quantity, optional user note, source/provenance.
- Snapshot: immutable published configuration so later item-data updates do not silently rewrite old builds.
- Engagement: likes, bookmarks, views, comments, forks; prevent duplicate likes/bookmarks per user.
- Moderation: reports, reason, status, moderatorId, timestamps, audit trail.

## Quality bar
- Every page has loading, empty, error, and success states.
- Validate all user input on both client and server.
- Enforce authorization on the server; hiding a button is not security.
- Add pagination or cursor-based loading for build feeds.
- Add metadata, shareable URLs, Open Graph previews, and useful 404 pages.
- Include tests for permissions, build validation, filters, and critical user journeys.
- Provide seed/demo data clearly labeled as fictional if real data is unavailable.
