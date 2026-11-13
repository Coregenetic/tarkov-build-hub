---
name: weapon-build-editor
description: Implement the interactive Escape from Tarkov weapon build editor, attachment selection, compatibility validation, and build previews.
---

# Weapon Build Editor

## Builder workflow
1. Choose a weapon platform and exact base weapon.
2. Render its attachment slots in a clear hierarchy.
3. Let users search and filter parts by slot, compatibility, trader/flea availability, price range, and relevant attributes when reliable data exists.
4. Selecting a part updates the build preview and derived values.
5. Show incompatible, missing, locked, or unknown states explicitly.
6. Save draft, preview, publish, duplicate, or reset with confirmation where destructive.

## Rules
- Compatibility must come from a structured data source, never guessed from item names.
- Model nested attachment relationships (e.g. a part may expose additional slots).
- Prevent invalid combinations and explain why a part cannot be installed.
- Support alternate configurations and build variants.
- Keep user notes separate from canonical item data.
- Display stat deltas against the base weapon and label the source/version of every derived stat.
- Do not claim a build is "meta" or "best" without evidence and a defined patch context.

## Testing
Test nested slots, incompatible parts, missing data, duplicate parts, stale item IDs, patch changes, and save/reload fidelity.
