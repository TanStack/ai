---
'@tanstack/ai-code-mode': patch
---

fix(code-mode): validate tool input/output against schemas

Code mode converted a tool's input/output schema to JSON Schema for the prompt but never validated against it — unlike the normal agent-loop path. A provided `inputSchema`/`outputSchema` was effectively just documentation: inner (`external_*`) tools received raw, un-coerced sandbox args and outputs went unchecked. `toolToBinding` now runs the same Standard Schema validation, so defaults/coercions apply and invalid input/output throws an agent-readable error.
