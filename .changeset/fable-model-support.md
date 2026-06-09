---
'@tanstack/ai-anthropic': patch
'@tanstack/ai-openrouter': patch
---

Add support for Anthropic's Claude Fable 5 model (`claude-fable-5` on the Anthropic adapter, `anthropic/claude-fable-5` on the OpenRouter adapter), including model metadata, per-model provider option types, and input modality types.

Also correct Anthropic model metadata against the live Models API and https://platform.claude.com/docs/en/about-claude/pricing:

- `claude-opus-4-5` pricing is $5/MTok input and $25/MTok output (was wrongly listed at $15/$75); cache-read (`cached`) prices are now populated for all models that publish them.
- Fix invalid OpenRouter-style ids `claude-opus-4.8`/`claude-opus-4.8-fast` to the real Anthropic API ids `claude-opus-4-8`/`claude-opus-4-8-fast` (the dotted ids 404 against the Anthropic API).
- Correct stale context windows and output limits per the Models API: Opus 4.6, Sonnet 4.5, and Sonnet 4 have 1M context; Sonnet 4.6 supports 128K output; Opus 4.5 supports 64K output; Opus 4.1 caps at 32K output.
- Register `claude-fable-5`, `claude-opus-4-7-fast`, `claude-opus-4-8`, and `claude-opus-4-8-fast` in `AnthropicChatModelToolCapabilitiesByName` so server tools type-check on those models (the sync script now maintains this map too).
- Update `@anthropic-ai/sdk` to ^0.104.0, whose `Model` union includes `claude-fable-5` and `claude-opus-4-8`.
