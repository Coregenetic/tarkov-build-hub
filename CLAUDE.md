# Claude Code Project Instructions — Tarkov Build Hub

You are building a polished community website where Escape from Tarkov players can create, publish, discover, rate, save, discuss, and remix weapon builds.

## Working method
1. Inspect the existing repository before editing. Identify framework, package manager, current routes, database, auth, deployment, and conventions.
2. Write a short implementation plan and identify unknowns. Do not stop at planning: implement in small, testable increments.
3. Do not rewrite working systems or replace infrastructure without explaining the tradeoff.
4. Keep the app runnable after each milestone. Run lint, typecheck, tests, and production build; fix failures before moving on.
5. Never use fake data as if it were real. Clearly label demo content.
6. Never claim a feature, test, integration, or deployment works unless you have verified it.

## Product scope
- Public discovery feed: trending, newest, featured, curated categories.
- Search and filters: weapon, caliber, role, budget, tags, patch, creator, popularity.
- Build detail: weapon and attachments, compatibility, stat summary, cost with source/freshness, notes, creator, patch, comments, share link.
- Build editor: nested attachment slots, compatible-part search, live preview, stat deltas, draft/publish, duplicate/fork.
- Accounts: profile, published builds, bookmarks, likes, comments, settings.
- Community: likes, bookmarks, comments, forks, reports, moderation.
- Admin: item-data imports, source freshness, reported content, audit log.
- Responsive, accessible, fast, SEO-friendly UI.

## Technical decision policy
- Reuse the current stack if it is sound.
- If starting from zero, propose a TypeScript-first stack with a maintainable component system and a relational data model suitable for complex build relationships. Explain the choice before scaffolding.
- Separate canonical game data from user-generated builds.
- Keep external data providers behind adapters.
- Version item data and published build snapshots by game patch.
- Add server-side validation and authorization from the start.

## UX direction
Premium tactical workbench: charcoal/graphite base, restrained olive/amber accents, crisp typography, readable dense data, high-quality responsive layouts. Original visual identity; do not copy proprietary game UI or use unlicensed assets.

## Definition of done
A feature is complete only when it has functional UI, server-side behavior, validation, authorization, loading/empty/error states, responsive behavior, and relevant tests/documentation.

## Skills
Read and follow the relevant skill files under `.claude/skills/`. `build-hub-grundsaetze` takes precedence over all others:
- `build-hub-grundsaetze`
- `tarkov-build-platform`
- `frontend-design`
- `weapon-build-editor`
- `backend-security`
- `tarkov-data-integrations`
- `qa-accessibility-performance`
- `deployment-ops`

## First task
Inspect the repository and report:
- what already exists,
- what stack and infrastructure it uses,
- what can be reused,
- the top risks/unknowns,
- a phased implementation plan.

Then start with the foundation and the first polished, working discovery page. Do not build the entire site as one giant untested change.
