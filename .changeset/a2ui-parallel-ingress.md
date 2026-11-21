---
'@tanstack/ai-generative-ui': minor
---

A2UI v0.9 surfaces as a parallel inbound ingress into the node-graph model.

Agents that already speak Google/CopilotKit **A2UI** can now contribute UI into
a host that renders Open Generative UI graphs — without the host growing a
second UI stack. A2UI operations are translated into the existing graph model,
so they flow through the same validator, bounded repair, renderer, and intent
machinery as a native graph. Inbound only; implemented clean-room from the A2UI
spec (Apache 2.0), no CopilotKit code.

- New `A2uiSurfaceStore` (`@tanstack/ai-generative-ui`): consumes A2UI v0.9
  operations (`createSurface` / `updateComponents` / `updateDataModel` /
  `deleteSurface`), keeps per-`surfaceId` state, buffers ops that race ahead of
  creation, and materialises each surface as a `GraphDocument`. Flat-list → tree
  with a cycle guard; `{ path }` bindings resolved against the data model; input
  `value` bindings become §5.3 state binds (never a frozen literal, never a
  leaked `{ path }`).
- `parseA2uiOperations` extracts ops from an `a2ui_operations` container, a JSON
  string, or a bare op; flat legacy shapes and unsupported versions are dropped
  **with a diagnostic**, never silently.
- A data-driven catalog mapping profile (A2UI basic catalog + common CopilotKit
  BYOC widgets) with a per-catalogId override hook; unmapped components degrade
  per §9.3.
- `classifyA2uiAction` / `a2uiActionToIntent` suggest an intent class
  (Action for world-changing verbs, else Submit); the host keeps the final say.
- `GraphProvenance` gains the `a2ui` driver and a `context` field so a translated
  graph is distinguishable from a native one in audit; the validator preserves
  both.

Outbound (OGUI → A2UI) export is out of scope — compute bindings and `Scene`
make it lossy. See `packages/ai-generative-ui/src/a2ui/ADDENDUM.md`.
