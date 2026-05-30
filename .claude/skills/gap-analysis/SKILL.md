---
name: gap-analysis
description: >
  Audit TanStack AI provider adapters for feature parity gaps and outdated
  model lists. Triggered as /gap-analysis <provider|feature <name>|models|--all>.
  Produces a dated markdown report under .agent/gap-analysis/. Maintainer
  tool — does not edit feature-support.ts or model-meta.ts directly.
---

# Gap Analysis — TanStack AI adapter audit

You are auditing TanStack AI's provider adapters against each provider's
upstream documentation. This is a **maintainer** tool. Your only output is a
markdown report under `.agent/gap-analysis/`. **Do not edit source files.**

## Invocation

| Args                             | Scope                                               |
| -------------------------------- | --------------------------------------------------- |
| `<provider>` (e.g. `openai`)     | One provider — all four audit dimensions.           |
| `feature <feature>` (e.g. `tts`) | One feature row of the matrix across all providers. |
| `models`                         | New-model diff for every provider.                  |
| `--all`                          | Full sweep (fan out subagents, one per provider).   |
| _(none)_                         | Ask the user which scope via AskUserQuestion.       |

## Workflow

1. **Parse scope.** If missing, AskUserQuestion with the four options above.
2. **Load the truth files**, then read the per-scope inputs you need:
   - Matrix: `testing/e2e/src/lib/feature-support.ts`
   - Types: `testing/e2e/src/lib/types.ts` (Provider + Feature unions, ALL_PROVIDERS, ALL_FEATURES)
   - Adapter index: `packages/ai-<provider>/src/index.ts`
   - Model meta: `packages/ai-<provider>/src/model-meta.ts`
   - Core types: `packages/ai/src/types.ts` (Modality, ContentPart, ToolCall)
3. **Research upstream.** Use WebFetch against the curated URLs in
   [references/provider-doc-urls.md](references/provider-doc-urls.md). When a
   doc page has moved, fall back to WebSearch. For SDK API surface details
   use the `context7` MCP server (`mcp__plugin_context7_context7__resolve-library-id`
   then `mcp__plugin_context7_context7__query-docs`).
4. **Walk the audit dimensions** in [references/audit-checklist.md](references/audit-checklist.md):
   1. New models
   2. Cross-adapter feature parity
   3. Untracked features
   4. Capability-flag drift
   5. Telemetry / observability parity (usage tokens, cache/reasoning
      counts, request ids, logging asymmetry)
5. **Fan out** for `--all`: launch one `Explore` subagent per provider, max 3
   in parallel. Each subagent returns the five-dimension findings for its
   provider; you synthesise into the combined report.
6. **Write the report** to `.agent/gap-analysis/YYYY-MM-DD-<scope>.md` using
   [references/report-template.md](references/report-template.md). Date is
   today's ISO date. `<scope>` is `openai` / `feature-tts` / `models` / `all`.
7. **Print the report path and a 5-line summary** to the user.

## Critical rules

1. **Never edit `feature-support.ts` or any `model-meta.ts`.** The report is
   read-only — the maintainer applies changes.
2. **Always reference line numbers** when citing exclusions (e.g.,
   `feature-support.ts:57`) so the maintainer can jump to them.
3. **Distinguish three gap classes** in the report:
   - **Real gap** — upstream supports it, TanStack AI doesn't, no exclusion comment.
   - **Tested gap** — TanStack AI doesn't list it but there's an exclusion
     comment in `feature-support.ts` (e.g., aimock format limitation). Not
     actionable code-wise; surface in "Out-of-scope" section.
   - **Stale capability flag** — `model-meta.ts` declares a capability the
     model no longer has, or omits one it now has.
4. **Cite sources.** Every claim "upstream supports X" must link the upstream
   doc page you read. No claims from training data.
5. **Use today's date** from the system context (currentDate). Never invent.
6. **Quote the relevant snippet** from `feature-support.ts` when flagging a
   parity gap, so the report is self-contained.

## Known providers

`openai`, `anthropic`, `gemini`, `ollama`, `grok`, `groq`, `openrouter`,
`bedrock` (`@tanstack/ai-bedrock`; adapter names `bedrock` /
`bedrock-responses`), `fal` (media-only), `elevenlabs` (TTS-only). The
feature matrix tracks `openai`, `anthropic`, `gemini`, `ollama`, `grok`,
`groq`, `openrouter`, `bedrock`, and `bedrock-responses`; `fal` and
`elevenlabs` only appear in model/media audits.

## Known features (19)

Canonical list is `ALL_FEATURES` in `testing/e2e/src/lib/types.ts` — always
re-read it; this list is a snapshot:

`chat`, `one-shot-text`, `reasoning`, `multi-turn`, `tool-calling`,
`parallel-tool-calls`, `tool-approval`, `text-tool-text`, `structured-output`,
`structured-output-stream`, `agentic-structured`, `multimodal-image`,
`multimodal-structured`, `summarize`, `summarize-stream`, `image-gen`, `tts`,
`transcription`, `video-gen`.

## Verification before finishing

Before printing the summary:

- Report file exists and is non-empty.
- `git status` shows only new files under `.agent/gap-analysis/` — nothing
  under `packages/` or `testing/` should have been modified. Run `git status`
  and confirm.
- Every "real gap" entry has an upstream doc URL.
