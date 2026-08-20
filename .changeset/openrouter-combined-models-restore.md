---
'@tanstack/ai-openrouter': patch
---

Restore `OPENROUTER_COMBINED_TOOLS_AND_SCHEMA_MODELS`, which the model-metadata sync dropped from the generated `model-meta.ts`. The set is now generated from OpenRouter's catalog (chat models whose `supported_parameters` include `structured_outputs`, `tools` and `tool_choice`) instead of being hand-maintained, so combined tools + `outputSchema` mode now covers every model OpenRouter flags as supporting it.
