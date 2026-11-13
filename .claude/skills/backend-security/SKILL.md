---
name: backend-security
description: Design and implement secure backend services, authentication, authorization, data validation, rate limits, and moderation for a user-generated Tarkov builds platform.
---

# Backend and Security

## Security baseline
- Use server-side authorization for every create, edit, delete, publish, bookmark, like, comment, and moderation operation.
- Users may edit only their own content; moderators receive narrowly scoped elevated permissions.
- Validate and normalize all inputs on the server. Enforce length limits and safe rich-text handling.
- Rate-limit authentication, comments, reactions, reports, and search endpoints.
- Protect against XSS, CSRF where applicable, injection, IDOR, spam, and mass assignment.
- Never expose service-role keys, private API keys, or admin credentials in client bundles.
- Store secrets in environment variables and provide an `.env.example` with placeholders only.
- Add audit records for moderation and privileged actions.
- Use soft-delete or recovery where appropriate; define retention behavior.

## Data integrity
- Enforce unique user/build reaction pairs.
- Use transactions or atomic operations for counters and ownership-sensitive changes.
- Treat published build snapshots as immutable versions.
- Add database indexes for feed sorting, filters, creator pages, and search.
- Document backup, migration, and rollback procedures.

## Deliverables
Document the data model, security rules/policies, environment variables, API contracts, and deployment steps. Add automated tests for authorization boundaries.
