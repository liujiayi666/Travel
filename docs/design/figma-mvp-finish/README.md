# roamwise MVP Finish

Local Figma plugin that repairs the `MVP · Travel Chat` page and applies the final MVP polish without using the Figma MCP call quota.

## Prerequisites

This is a repair plugin for the existing **Travel Web GPT** file, not a fresh-file generator. Before running it, the file must already contain:

- A `MVP · Travel Chat` page marked as plugin-owned, or the legacy page with the MVP component board and token board.
- `Travel / Primitives`, `Travel / Color`, `Travel / Spacing`, and `Travel / Radius` variable collections.
- The `Travel / Display`, `Heading`, `Title`, `Body`, `Body Small`, `Label`, and `Caption` text styles.

Missing prerequisites fail with a descriptive error instead of creating a partial design.

## Run

1. Open the **Travel Web GPT** file in Figma Desktop.
2. Open **Plugins → Development → Import plugin from manifest…**
3. Select `manifest.json` in this folder.
4. Run **roamwise MVP Finish**.
5. Click **Apply finish fix**.

The plugin is limited to editing this file and has no network access. It updates the MVP states, workspace sidebar, compact loading, four auth-field states, validation copy, spacious sign-in/sign-up modals, light and dark token boards, dark-mode screen, collapsed-sidebar state, and the legacy brand toggle icon.

Every reusable component is combined into a `Theme=Light` / `Theme=Dark` variant set. Select a component instance and use the `Theme` property in the right sidebar to switch modes. The token board includes a lightweight binding audit.

The `MVP · Travel Chat` page states are converted in place to whole-screen component instances with `Theme=Light` / `Theme=Dark` variants. A **MVP · Theme Screens** gallery page is also generated for browsing every state.

Icon vectors are normalized to semantic color variables after theme variants are created. Outer instance swapping is used to avoid stale nested instance references during dark-mode generation.

Generated pages and repair buttons carry plugin metadata. Re-running the plugin only removes nodes it owns; a pre-existing unowned page with the same generated name must be renamed before continuing.
