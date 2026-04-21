---
'@tanstack/ai': minor
---

Add `ProviderTool<TProvider, TKind>` phantom-branded tool subtype and a `toolCapabilities` channel on `TextAdapter['~types']`. `TextActivityOptions['tools']` is now typed so that adapter-exported provider tools are gated against the selected model's `supports.tools` list. User tools from `toolDefinition()` remain unaffected.
