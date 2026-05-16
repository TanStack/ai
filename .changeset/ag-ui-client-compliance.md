---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-svelte': minor
'@tanstack/ai-react-ui': minor
---

**Breaking:** AG-UI client-to-server compliance.

`@tanstack/ai-client` now POSTs an AG-UI `RunAgentInput` request body and `@tanstack/ai` server endpoints must use the new `chatParamsFromRequestBody` + `mergeAgentTools` helpers. Upgrade both packages together.

Highlights:

- **Wire format**: `{threadId, runId, state, messages, tools, context, forwardedProps}` (per AG-UI 0.0.52 `RunAgentInputSchema`) instead of `{messages, data}`.
- **New server helpers** exported from `@tanstack/ai`: `chatParamsFromRequestBody`, `mergeAgentTools`.
- **`chat()` accepts `threadId`, `runId`, `parentRunId`** as optional fields for AG-UI run correlation.
- **`ChatClient` accepts `threadId`** option; auto-generates and persists per session if omitted; fresh `runId` per send.
- **Client tools auto-advertised** to the server via `RunAgentInput.tools`.
- **Foreign AG-UI clients** can hit a TanStack server: `developer` collapses to `system`, `reasoning`/`activity` drop.

See `docs/migration/ag-ui-compliance.md` for full migration steps.
