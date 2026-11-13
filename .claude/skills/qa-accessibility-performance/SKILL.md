---
name: qa-accessibility-performance
description: Test, audit, and improve quality, accessibility, responsiveness, and performance across the Tarkov build-sharing platform.
---

# QA, Accessibility, and Performance

## Before calling a feature complete
- Test desktop, tablet, and mobile breakpoints.
- Test keyboard-only navigation, visible focus, labels, contrast, and screen-reader names.
- Check loading, empty, offline, permission-denied, validation, and server-error states.
- Verify all interactive controls perform their stated action.
- Test long titles, missing images, unknown item data, and large build configurations.
- Check that search/filter combinations can be reset and are reflected in shareable URLs where useful.

## Performance
- Optimize images and lazy-load below-the-fold media.
- Paginate feeds and avoid unbounded database reads.
- Avoid unnecessary client-side bundles and repeated network calls.
- Add caching only with clear invalidation rules.
- Measure real page performance before optimizing blindly.

## Test strategy
Use unit tests for compatibility and calculations, integration tests for persistence and permissions, and end-to-end tests for discovery, publishing, bookmarking, and commenting. Include regression tests for every fixed bug.
