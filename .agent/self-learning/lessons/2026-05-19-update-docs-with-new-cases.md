---
name: update-docs-with-new-cases
description: Use when adding a new use case, capability, or behavior change to tanstack/ai — public docs that cover the surface need updating in the same PR
tags: [documentation, monorepo, pr-discipline]
scope: repo
source:
  type: user-correction
  created: 2026-05-19T11:50:00Z
related_skill: null
related: [update-skills-with-feature-work]
---

# Docs Need to Be Updated When Adding New Cases

**Rule:** When a PR adds a new pattern, capability, or behavior change to the public surface of any tanstack/ai package, update the corresponding doc page(s) in `docs/**` in the same PR. New cases that aren't documented don't exist for users.

**Why:** The user flagged this after shipping the multi-turn structured-output PR. Initial commits added the typed `StructuredOutputPart` on `useChat`'s `messages`, the schema-generic flow through `UIMessage<TTools, TData>`, and the recipe-builder pattern — but the docs only got updated several turns later, after the user explicitly asked. The window between "feature ships" and "docs catch up" is a window where users following the docs hit either obsolete advice (the "hide TextPart" filter hack the PR removed) or missing capability (no mention of multi-turn structured chat at all). Both are silent failures.

**How to apply:**

1. **At feature-design time**, identify which doc pages cover the surface being changed. Grep `docs/**` for the symbols, types, hooks, or patterns the feature touches. Note them as part of the implementation plan, not as follow-up.
2. **For each affected doc page, decide:** does it need a correction (the feature contradicts what's written) or an addition (the feature opens a new use case)? Often both.
3. **If a new use case warrants its own page**, plan the page placement / IA at feature-design time. New pages often imply nav-config updates (`docs/config.json`), a deprecation stub at the old location, and cross-link edits in adapter / API reference docs.
4. **Run `pnpm test:docs` after editing** — the link checker catches the cross-link rot reorgs introduce.
5. **Fact-check the docs** the same way as agent skills — dispatch a verification pass against the current source. Hallucinated APIs in docs send users down dead ends.
6. **Coordinate with the related skill update** (see [[update-skills-with-feature-work]]) — the same surface change usually needs both, and the same fact-check pattern catches the same kinds of bugs.

**Heuristic for "does this PR need doc updates":** if the answer to "would a user reading the existing docs after this PR ships be misled?" is yes, the docs need updating. If the answer to "would a user benefit from knowing about the new capability?" is yes, the docs need adding to. Most non-trivial PRs hit one of those two.
