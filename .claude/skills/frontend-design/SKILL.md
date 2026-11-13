---
name: frontend-design
description: Create distinctive, polished, responsive interfaces for the Tarkov build-sharing platform. Use for all frontend pages, components, visual systems, and interaction design.
---

# Frontend Design

Create a premium tactical-tech interface inspired by the visual language of an equipment workbench, while remaining original and readable. Do not copy Escape from Tarkov logos, artwork, or proprietary UI assets.

## Visual direction
- Dark graphite / charcoal foundation, restrained olive or amber accents, high-contrast text, subtle borders, disciplined spacing.
- Use typography with strong hierarchy; avoid tiny text and excessive all-caps.
- Use real item imagery only when licensed/available. Otherwise use clean placeholders with consistent silhouettes and labels.
- Avoid generic SaaS gradients, glassmorphism overload, giant empty hero sections, and dashboard-card spam.
- Make dense weapon data scannable with aligned values, clear labels, and responsive layouts.

## Required screens
- Landing/discover page with featured builds, trending, newest, and weapon categories.
- Build detail page with large weapon preview, attachment breakdown, stats, estimated cost when sourced, creator profile, comments, and actions.
- Interactive build editor with weapon selection, slot map/list, compatible-part picker, search, filters, and live summary.
- User profile with published builds, saved builds, reputation, and activity.
- Search results and filter drawer.
- Authentication, settings, report flow, moderation queue, and useful empty/error states.

## Interaction requirements
- Make controls work; no decorative buttons.
- Keyboard accessible dialogs, menus, tabs, and forms.
- On mobile, use a practical stacked layout and bottom-friendly primary actions.
- Add skeletons for loading, optimistic feedback only when rollback is implemented, and clear toast/error messages.
- Keep component states explicit and avoid giant monolithic page components.

Before implementing, inspect the existing project and preserve its conventions. Do not replace working infrastructure without a clear reason.
