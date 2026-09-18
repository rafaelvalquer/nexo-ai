# E2E migration inventory

Inventory of the current `tests/e2e` suite after the navigation and architecture simplification. `CURRENT` means the scenario describes a supported surface; `REWRITE` means the test was updated to follow the supported route or behavior; `LEGACY` means it asserts a removed product surface and should be deleted; `DELETE` means the old coverage is intentionally removed because the feature no longer exists.

| Test file | Status | Action / coverage |
|---|---|---|
| `agent-v2-location-filesystem.e2e.ts` | CURRENT | Deterministic file routing and allowed-root behavior. |
| `agent-v2-multistep-electron.e2e.ts` | CURRENT | Electron execution, document resources, approvals, and recovery. |
| `assistant.e2e.ts` | CURRENT | Main navigation, command palette, accessibility, and chat. |
| `chat-history.e2e.ts` | CURRENT | Recent-message paging, retry, tabs, and scroll anchoring. |
| `chat-layout.e2e.ts` | CURRENT | Responsive chat layout. |
| `chat-resources-electron.e2e.ts` | CURRENT | Real Electron file cards and approval. |
| `chat-resources.e2e.ts` | CURRENT | Resource cards, accessible review, and keyboard flows. |
| `connections.e2e.ts` | REWRITE | Uses Settings > Integrations and verifies recoverable account state. |
| `dashboard.e2e.ts` | CURRENT | Retained dashboard and lazy-route behavior. |
| `documents.e2e.ts` | CURRENT | Optional document-library retry and preview behavior. |
| `macros.e2e.ts` | CURRENT | Canonical MacroEngine UI, authoring, testing, and execution. |
| `pixel-office-scene.e2e.ts` | CURRENT | Pixel Office scene behavior independent of navigation. |
| `pixel-office.e2e.ts` | REWRITE | Enters through the Office sidebar and observes real execution events. |
| `settings.e2e.ts` | CURRENT | Settings, local AI, diagnostics, version, and accessibility. |
| `tools.e2e.ts` | REWRITE | Tool catalog is exercised within Settings, not as a primary page. |

No current E2E file targets the removed `Hoje`, `NucleusCanvas`, or `NucleusSurface` screens. No file is classified `LEGACY` or `DELETE`; their stale tests were already removed from the current suite. The existing tests cover the plan's intent under the current filenames: assistant/chat history and resources cover chat and files, macros cover authoring and recovery flows, settings cover configuration, and the Electron tests cover approvals and real execution.

Run the full inventory with `pnpm test:e2e`; the release workflow treats any failed test as a gate failure.
